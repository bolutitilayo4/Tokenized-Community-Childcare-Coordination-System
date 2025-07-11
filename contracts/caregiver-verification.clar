;; Caregiver Verification Contract
;; Validates childcare provider credentials and background checks

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u100))
(define-constant ERR_NOT_FOUND (err u101))
(define-constant ERR_ALREADY_EXISTS (err u102))
(define-constant ERR_INVALID_INPUT (err u103))
(define-constant ERR_EXPIRED (err u104))

;; Data Variables
(define-data-var contract-paused bool false)
(define-data-var verification-fee uint u1000000) ;; 1 STX in microSTX

;; Data Maps
(define-map caregivers
  { caregiver-id: uint }
  {
    principal: principal,
    name-hash: (buff 32),
    credentials-hash: (buff 32),
    background-check-hash: (buff 32),
    verification-date: uint,
    expiration-date: uint,
    status: (string-ascii 20),
    rating: uint,
    total-reviews: uint
  }
)

(define-map caregiver-principals
  { principal: principal }
  { caregiver-id: uint }
)

(define-map verification-requests
  { request-id: uint }
  {
    caregiver-principal: principal,
    submitted-date: uint,
    status: (string-ascii 20),
    reviewer: (optional principal)
  }
)

(define-map authorized-verifiers
  { verifier: principal }
  { authorized: bool }
)

;; Data Variables for IDs
(define-data-var next-caregiver-id uint u1)
(define-data-var next-request-id uint u1)

;; Authorization Functions
(define-private (is-contract-owner)
  (is-eq tx-sender CONTRACT_OWNER)
)

(define-private (is-authorized-verifier)
  (default-to false (get authorized (map-get? authorized-verifiers { verifier: tx-sender })))
)

(define-private (is-contract-active)
  (not (var-get contract-paused))
)

;; Admin Functions
(define-public (pause-contract)
  (begin
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)
    (var-set contract-paused true)
    (ok true)
  )
)

(define-public (unpause-contract)
  (begin
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)
    (var-set contract-paused false)
    (ok true)
  )
)

(define-public (add-authorized-verifier (verifier principal))
  (begin
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)
    (map-set authorized-verifiers { verifier: verifier } { authorized: true })
    (ok true)
  )
)

(define-public (remove-authorized-verifier (verifier principal))
  (begin
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)
    (map-set authorized-verifiers { verifier: verifier } { authorized: false })
    (ok true)
  )
)

;; Caregiver Registration Functions
(define-public (submit-verification-request (name-hash (buff 32)) (credentials-hash (buff 32)) (background-check-hash (buff 32)))
  (let
    (
      (request-id (var-get next-request-id))
      (current-block block-height)
    )
    (asserts! (is-contract-active) ERR_UNAUTHORIZED)
    (asserts! (is-none (map-get? caregiver-principals { principal: tx-sender })) ERR_ALREADY_EXISTS)

    ;; Store verification request
    (map-set verification-requests
      { request-id: request-id }
      {
        caregiver-principal: tx-sender,
        submitted-date: current-block,
        status: "pending",
        reviewer: none
      }
    )

    ;; Increment request ID
    (var-set next-request-id (+ request-id u1))

    (ok request-id)
  )
)

(define-public (approve-verification (request-id uint) (name-hash (buff 32)) (credentials-hash (buff 32)) (background-check-hash (buff 32)))
  (let
    (
      (request (unwrap! (map-get? verification-requests { request-id: request-id }) ERR_NOT_FOUND))
      (caregiver-id (var-get next-caregiver-id))
      (current-block block-height)
      (expiration-block (+ current-block u52560)) ;; Approximately 1 year in blocks
    )
    (asserts! (is-contract-active) ERR_UNAUTHORIZED)
    (asserts! (is-authorized-verifier) ERR_UNAUTHORIZED)
    (asserts! (is-eq (get status request) "pending") ERR_INVALID_INPUT)

    ;; Create caregiver record
    (map-set caregivers
      { caregiver-id: caregiver-id }
      {
        principal: (get caregiver-principal request),
        name-hash: name-hash,
        credentials-hash: credentials-hash,
        background-check-hash: background-check-hash,
        verification-date: current-block,
        expiration-date: expiration-block,
        status: "verified",
        rating: u0,
        total-reviews: u0
      }
    )

    ;; Map principal to caregiver ID
    (map-set caregiver-principals
      { principal: (get caregiver-principal request) }
      { caregiver-id: caregiver-id }
    )

    ;; Update request status
    (map-set verification-requests
      { request-id: request-id }
      (merge request { status: "approved", reviewer: (some tx-sender) })
    )

    ;; Increment caregiver ID
    (var-set next-caregiver-id (+ caregiver-id u1))

    (ok caregiver-id)
  )
)

(define-public (reject-verification (request-id uint) (reason (string-ascii 100)))
  (let
    (
      (request (unwrap! (map-get? verification-requests { request-id: request-id }) ERR_NOT_FOUND))
    )
    (asserts! (is-contract-active) ERR_UNAUTHORIZED)
    (asserts! (is-authorized-verifier) ERR_UNAUTHORIZED)
    (asserts! (is-eq (get status request) "pending") ERR_INVALID_INPUT)

    ;; Update request status
    (map-set verification-requests
      { request-id: request-id }
      (merge request { status: "rejected", reviewer: (some tx-sender) })
    )

    (ok true)
  )
)

;; Caregiver Management Functions
(define-public (renew-verification (caregiver-id uint) (new-credentials-hash (buff 32)) (new-background-check-hash (buff 32)))
  (let
    (
      (caregiver (unwrap! (map-get? caregivers { caregiver-id: caregiver-id }) ERR_NOT_FOUND))
      (current-block block-height)
      (new-expiration (+ current-block u52560))
    )
    (asserts! (is-contract-active) ERR_UNAUTHORIZED)
    (asserts! (is-eq tx-sender (get principal caregiver)) ERR_UNAUTHORIZED)

    ;; Update caregiver record
    (map-set caregivers
      { caregiver-id: caregiver-id }
      (merge caregiver {
        credentials-hash: new-credentials-hash,
        background-check-hash: new-background-check-hash,
        verification-date: current-block,
        expiration-date: new-expiration
      })
    )

    (ok true)
  )
)

(define-public (suspend-caregiver (caregiver-id uint))
  (let
    (
      (caregiver (unwrap! (map-get? caregivers { caregiver-id: caregiver-id }) ERR_NOT_FOUND))
    )
    (asserts! (is-contract-active) ERR_UNAUTHORIZED)
    (asserts! (is-authorized-verifier) ERR_UNAUTHORIZED)

    ;; Update status to suspended
    (map-set caregivers
      { caregiver-id: caregiver-id }
      (merge caregiver { status: "suspended" })
    )

    (ok true)
  )
)

(define-public (reactivate-caregiver (caregiver-id uint))
  (let
    (
      (caregiver (unwrap! (map-get? caregivers { caregiver-id: caregiver-id }) ERR_NOT_FOUND))
    )
    (asserts! (is-contract-active) ERR_UNAUTHORIZED)
    (asserts! (is-authorized-verifier) ERR_UNAUTHORIZED)
    (asserts! (is-eq (get status caregiver) "suspended") ERR_INVALID_INPUT)

    ;; Update status to verified
    (map-set caregivers
      { caregiver-id: caregiver-id }
      (merge caregiver { status: "verified" })
    )

    (ok true)
  )
)

;; Rating Functions
(define-public (update-rating (caregiver-id uint) (new-rating uint))
  (let
    (
      (caregiver (unwrap! (map-get? caregivers { caregiver-id: caregiver-id }) ERR_NOT_FOUND))
      (current-rating (get rating caregiver))
      (current-reviews (get total-reviews caregiver))
      (new-total-reviews (+ current-reviews u1))
      (calculated-rating (/ (+ (* current-rating current-reviews) new-rating) new-total-reviews))
    )
    (asserts! (is-contract-active) ERR_UNAUTHORIZED)
    (asserts! (<= new-rating u5) ERR_INVALID_INPUT)
    (asserts! (>= new-rating u1) ERR_INVALID_INPUT)

    ;; Update rating and review count
    (map-set caregivers
      { caregiver-id: caregiver-id }
      (merge caregiver {
        rating: calculated-rating,
        total-reviews: new-total-reviews
      })
    )

    (ok calculated-rating)
  )
)

;; Read-only Functions
(define-read-only (get-caregiver (caregiver-id uint))
  (map-get? caregivers { caregiver-id: caregiver-id })
)

(define-read-only (get-caregiver-by-principal (principal-addr principal))
  (match (map-get? caregiver-principals { principal: principal-addr })
    caregiver-data (map-get? caregivers { caregiver-id: (get caregiver-id caregiver-data) })
    none
  )
)

(define-read-only (get-verification-request (request-id uint))
  (map-get? verification-requests { request-id: request-id })
)

(define-read-only (is-caregiver-verified (caregiver-id uint))
  (match (map-get? caregivers { caregiver-id: caregiver-id })
    caregiver (and
                (is-eq (get status caregiver) "verified")
                (> (get expiration-date caregiver) block-height))
    false
  )
)

(define-read-only (is-caregiver-active (caregiver-id uint))
  (match (map-get? caregivers { caregiver-id: caregiver-id })
    caregiver (is-eq (get status caregiver) "verified")
    false
  )
)

(define-read-only (get-contract-info)
  {
    paused: (var-get contract-paused),
    verification-fee: (var-get verification-fee),
    next-caregiver-id: (var-get next-caregiver-id),
    next-request-id: (var-get next-request-id)
  }
)
