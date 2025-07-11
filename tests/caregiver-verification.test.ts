import { describe, it, expect, beforeEach } from "vitest"

describe("Caregiver Verification Contract", () => {
  let contractState
  let mockTxSender
  let mockBlockHeight
  
  beforeEach(() => {
    // Reset contract state for each test
    contractState = {
      contractPaused: false,
      verificationFee: 1000000,
      nextCaregiverId: 1,
      nextRequestId: 1,
      caregivers: new Map(),
      caregiverPrincipals: new Map(),
      verificationRequests: new Map(),
      authorizedVerifiers: new Map(),
    }
    
    mockTxSender = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"
    mockBlockHeight = 1000
  })
  
  describe("Contract Initialization", () => {
    it("should initialize with correct default values", () => {
      expect(contractState.contractPaused).toBe(false)
      expect(contractState.verificationFee).toBe(1000000)
      expect(contractState.nextCaregiverId).toBe(1)
      expect(contractState.nextRequestId).toBe(1)
    })
  })
  
  describe("Admin Functions", () => {
    it("should allow contract owner to pause contract", () => {
      // Simulate pause-contract function
      const result = pauseContract(mockTxSender, contractState)
      expect(result.success).toBe(true)
      expect(contractState.contractPaused).toBe(true)
    })
    
    it("should allow contract owner to unpause contract", () => {
      contractState.contractPaused = true
      const result = unpauseContract(mockTxSender, contractState)
      expect(result.success).toBe(true)
      expect(contractState.contractPaused).toBe(false)
    })
    
    it("should allow adding authorized verifiers", () => {
      const verifierPrincipal = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
      const result = addAuthorizedVerifier(mockTxSender, verifierPrincipal, contractState)
      expect(result.success).toBe(true)
      expect(contractState.authorizedVerifiers.get(verifierPrincipal)).toBe(true)
    })
    
    it("should prevent unauthorized users from pausing contract", () => {
      const unauthorizedUser = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
      const result = pauseContract(unauthorizedUser, contractState)
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_UNAUTHORIZED")
    })
  })
  
  describe("Verification Request Functions", () => {
    it("should allow submitting verification request", () => {
      const nameHash = new Uint8Array(32).fill(1)
      const credentialsHash = new Uint8Array(32).fill(2)
      const backgroundCheckHash = new Uint8Array(32).fill(3)
      
      const result = submitVerificationRequest(
          mockTxSender,
          nameHash,
          credentialsHash,
          backgroundCheckHash,
          contractState,
          mockBlockHeight,
      )
      
      expect(result.success).toBe(true)
      expect(result.requestId).toBe(1)
      expect(contractState.nextRequestId).toBe(2)
      
      const request = contractState.verificationRequests.get(1)
      expect(request.caregiverPrincipal).toBe(mockTxSender)
      expect(request.status).toBe("pending")
    })
    
    it("should prevent duplicate verification requests", () => {
      // First request
      const nameHash = new Uint8Array(32).fill(1)
      const credentialsHash = new Uint8Array(32).fill(2)
      const backgroundCheckHash = new Uint8Array(32).fill(3)
      
      submitVerificationRequest(
          mockTxSender,
          nameHash,
          credentialsHash,
          backgroundCheckHash,
          contractState,
          mockBlockHeight,
      )
      
      // Add caregiver to simulate existing registration
      contractState.caregiverPrincipals.set(mockTxSender, { caregiverId: 1 })
      
      // Second request should fail
      const result = submitVerificationRequest(
          mockTxSender,
          nameHash,
          credentialsHash,
          backgroundCheckHash,
          contractState,
          mockBlockHeight,
      )
      
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_ALREADY_EXISTS")
    })
  })
  
  describe("Verification Approval Functions", () => {
    beforeEach(() => {
      // Add authorized verifier
      contractState.authorizedVerifiers.set(mockTxSender, true)
      
      // Create pending verification request
      contractState.verificationRequests.set(1, {
        caregiverPrincipal: "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG",
        submittedDate: mockBlockHeight,
        status: "pending",
        reviewer: null,
      })
    })
    
    it("should allow authorized verifier to approve verification", () => {
      const nameHash = new Uint8Array(32).fill(1)
      const credentialsHash = new Uint8Array(32).fill(2)
      const backgroundCheckHash = new Uint8Array(32).fill(3)
      
      const result = approveVerification(
          mockTxSender,
          1,
          nameHash,
          credentialsHash,
          backgroundCheckHash,
          contractState,
          mockBlockHeight,
      )
      
      expect(result.success).toBe(true)
      expect(result.caregiverId).toBe(1)
      expect(contractState.nextCaregiverId).toBe(2)
      
      const caregiver = contractState.caregivers.get(1)
      expect(caregiver.status).toBe("verified")
      expect(caregiver.principal).toBe("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG")
    })
    
    it("should prevent unauthorized users from approving verification", () => {
      const unauthorizedUser = "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP"
      const nameHash = new Uint8Array(32).fill(1)
      const credentialsHash = new Uint8Array(32).fill(2)
      const backgroundCheckHash = new Uint8Array(32).fill(3)
      
      const result = approveVerification(
          unauthorizedUser,
          1,
          nameHash,
          credentialsHash,
          backgroundCheckHash,
          contractState,
          mockBlockHeight,
      )
      
      expect(result.success).toBe(false)
      expect(result.error).toBe("ERR_UNAUTHORIZED")
    })
    
    it("should allow rejecting verification requests", () => {
      const result = rejectVerification(mockTxSender, 1, "Insufficient documentation", contractState)
      
      expect(result.success).toBe(true)
      
      const request = contractState.verificationRequests.get(1)
      expect(request.status).toBe("rejected")
      expect(request.reviewer).toBe(mockTxSender)
    })
  })
  
  describe("Caregiver Management Functions", () => {
    beforeEach(() => {
      // Create verified caregiver
      const caregiverPrincipal = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
      contractState.caregivers.set(1, {
        principal: caregiverPrincipal,
        nameHash: new Uint8Array(32).fill(1),
        credentialsHash: new Uint8Array(32).fill(2),
        backgroundCheckHash: new Uint8Array(32).fill(3),
        verificationDate: mockBlockHeight,
        expirationDate: mockBlockHeight + 52560,
        status: "verified",
        rating: 0,
        totalReviews: 0,
      })
      contractState.caregiverPrincipals.set(caregiverPrincipal, { caregiverId: 1 })
    })
    
    it("should allow caregiver to renew verification", () => {
      const caregiverPrincipal = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
      const newCredentialsHash = new Uint8Array(32).fill(4)
      const newBackgroundCheckHash = new Uint8Array(32).fill(5)
      
      const result = renewVerification(
          caregiverPrincipal,
          1,
          newCredentialsHash,
          newBackgroundCheckHash,
          contractState,
          mockBlockHeight + 1000,
      )
      
      expect(result.success).toBe(true)
      
      const caregiver = contractState.caregivers.get(1)
      expect(caregiver.credentialsHash).toEqual(newCredentialsHash)
      expect(caregiver.backgroundCheckHash).toEqual(newBackgroundCheckHash)
      expect(caregiver.verificationDate).toBe(mockBlockHeight + 1000)
    })
    
    it("should allow authorized verifier to suspend caregiver", () => {
      contractState.authorizedVerifiers.set(mockTxSender, true)
      
      const result = suspendCaregiver(mockTxSender, 1, contractState)
      
      expect(result.success).toBe(true)
      
      const caregiver = contractState.caregivers.get(1)
      expect(caregiver.status).toBe("suspended")
    })
    
    it("should allow updating caregiver rating", () => {
      const result = updateRating(mockTxSender, 1, 4, contractState)
      
      expect(result.success).toBe(true)
      
      const caregiver = contractState.caregivers.get(1)
      expect(caregiver.rating).toBe(4)
      expect(caregiver.totalReviews).toBe(1)
    })
    
    it("should calculate average rating correctly", () => {
      // First rating
      updateRating(mockTxSender, 1, 4, contractState)
      
      // Second rating
      const result = updateRating("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP", 1, 5, contractState)
      
      expect(result.success).toBe(true)
      
      const caregiver = contractState.caregivers.get(1)
      expect(caregiver.rating).toBe(4) // (4 + 5) / 2 = 4.5, rounded down
      expect(caregiver.totalReviews).toBe(2)
    })
  })
  
  describe("Read-only Functions", () => {
    beforeEach(() => {
      // Create test caregiver
      const caregiverPrincipal = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
      contractState.caregivers.set(1, {
        principal: caregiverPrincipal,
        nameHash: new Uint8Array(32).fill(1),
        credentialsHash: new Uint8Array(32).fill(2),
        backgroundCheckHash: new Uint8Array(32).fill(3),
        verificationDate: mockBlockHeight,
        expirationDate: mockBlockHeight + 52560,
        status: "verified",
        rating: 4,
        totalReviews: 10,
      })
      contractState.caregiverPrincipals.set(caregiverPrincipal, { caregiverId: 1 })
    })
    
    it("should return caregiver information", () => {
      const caregiver = getCaregiver(1, contractState)
      expect(caregiver).toBeDefined()
      expect(caregiver.status).toBe("verified")
      expect(caregiver.rating).toBe(4)
    })
    
    it("should return caregiver by principal", () => {
      const caregiverPrincipal = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG"
      const caregiver = getCaregiverByPrincipal(caregiverPrincipal, contractState)
      expect(caregiver).toBeDefined()
      expect(caregiver.principal).toBe(caregiverPrincipal)
    })
    
    it("should check if caregiver is verified and not expired", () => {
      const isVerified = isCaregiverVerified(1, contractState, mockBlockHeight + 1000)
      expect(isVerified).toBe(true)
      
      // Check with expired date
      const isVerifiedExpired = isCaregiverVerified(1, contractState, mockBlockHeight + 60000)
      expect(isVerifiedExpired).toBe(false)
    })
    
    it("should return contract information", () => {
      const contractInfo = getContractInfo(contractState)
      expect(contractInfo.paused).toBe(false)
      expect(contractInfo.verificationFee).toBe(1000000)
      expect(contractInfo.nextCaregiverId).toBe(1)
      expect(contractInfo.nextRequestId).toBe(1)
    })
  })
})

// Helper functions to simulate contract behavior
function pauseContract(txSender, contractState) {
  if (txSender !== "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM") {
    return { success: false, error: "ERR_UNAUTHORIZED" }
  }
  contractState.contractPaused = true
  return { success: true }
}

function unpauseContract(txSender, contractState) {
  if (txSender !== "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM") {
    return { success: false, error: "ERR_UNAUTHORIZED" }
  }
  contractState.contractPaused = false
  return { success: true }
}

function addAuthorizedVerifier(txSender, verifier, contractState) {
  if (txSender !== "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM") {
    return { success: false, error: "ERR_UNAUTHORIZED" }
  }
  contractState.authorizedVerifiers.set(verifier, true)
  return { success: true }
}

function submitVerificationRequest(
    txSender,
    nameHash,
    credentialsHash,
    backgroundCheckHash,
    contractState,
    blockHeight,
) {
  if (contractState.contractPaused) {
    return { success: false, error: "ERR_UNAUTHORIZED" }
  }
  if (contractState.caregiverPrincipals.has(txSender)) {
    return { success: false, error: "ERR_ALREADY_EXISTS" }
  }
  
  const requestId = contractState.nextRequestId
  contractState.verificationRequests.set(requestId, {
    caregiverPrincipal: txSender,
    submittedDate: blockHeight,
    status: "pending",
    reviewer: null,
  })
  contractState.nextRequestId += 1
  
  return { success: true, requestId }
}

function approveVerification(
    txSender,
    requestId,
    nameHash,
    credentialsHash,
    backgroundCheckHash,
    contractState,
    blockHeight,
) {
  if (contractState.contractPaused) {
    return { success: false, error: "ERR_UNAUTHORIZED" }
  }
  if (!contractState.authorizedVerifiers.get(txSender)) {
    return { success: false, error: "ERR_UNAUTHORIZED" }
  }
  
  const request = contractState.verificationRequests.get(requestId)
  if (!request || request.status !== "pending") {
    return { success: false, error: "ERR_NOT_FOUND" }
  }
  
  const caregiverId = contractState.nextCaregiverId
  contractState.caregivers.set(caregiverId, {
    principal: request.caregiverPrincipal,
    nameHash,
    credentialsHash,
    backgroundCheckHash,
    verificationDate: blockHeight,
    expirationDate: blockHeight + 52560,
    status: "verified",
    rating: 0,
    totalReviews: 0,
  })
  
  contractState.caregiverPrincipals.set(request.caregiverPrincipal, { caregiverId })
  contractState.nextCaregiverId += 1
  
  request.status = "approved"
  request.reviewer = txSender
  
  return { success: true, caregiverId }
}

function rejectVerification(txSender, requestId, reason, contractState) {
  if (!contractState.authorizedVerifiers.get(txSender)) {
    return { success: false, error: "ERR_UNAUTHORIZED" }
  }
  
  const request = contractState.verificationRequests.get(requestId)
  if (!request || request.status !== "pending") {
    return { success: false, error: "ERR_NOT_FOUND" }
  }
  
  request.status = "rejected"
  request.reviewer = txSender
  
  return { success: true }
}

function renewVerification(
    txSender,
    caregiverId,
    newCredentialsHash,
    newBackgroundCheckHash,
    contractState,
    blockHeight,
) {
  const caregiver = contractState.caregivers.get(caregiverId)
  if (!caregiver || caregiver.principal !== txSender) {
    return { success: false, error: "ERR_UNAUTHORIZED" }
  }
  
  caregiver.credentialsHash = newCredentialsHash
  caregiver.backgroundCheckHash = newBackgroundCheckHash
  caregiver.verificationDate = blockHeight
  caregiver.expirationDate = blockHeight + 52560
  
  return { success: true }
}

function suspendCaregiver(txSender, caregiverId, contractState) {
  if (!contractState.authorizedVerifiers.get(txSender)) {
    return { success: false, error: "ERR_UNAUTHORIZED" }
  }
  
  const caregiver = contractState.caregivers.get(caregiverId)
  if (!caregiver) {
    return { success: false, error: "ERR_NOT_FOUND" }
  }
  
  caregiver.status = "suspended"
  return { success: true }
}

function updateRating(txSender, caregiverId, newRating, contractState) {
  if (newRating < 1 || newRating > 5) {
    return { success: false, error: "ERR_INVALID_INPUT" }
  }
  
  const caregiver = contractState.caregivers.get(caregiverId)
  if (!caregiver) {
    return { success: false, error: "ERR_NOT_FOUND" }
  }
  
  const currentRating = caregiver.rating
  const currentReviews = caregiver.totalReviews
  const newTotalReviews = currentReviews + 1
  const calculatedRating = Math.floor((currentRating * currentReviews + newRating) / newTotalReviews)
  
  caregiver.rating = calculatedRating
  caregiver.totalReviews = newTotalReviews
  
  return { success: true, calculatedRating }
}

function getCaregiver(caregiverId, contractState) {
  return contractState.caregivers.get(caregiverId)
}

function getCaregiverByPrincipal(principal, contractState) {
  const principalData = contractState.caregiverPrincipals.get(principal)
  if (!principalData) return null
  return contractState.caregivers.get(principalData.caregiverId)
}

function isCaregiverVerified(caregiverId, contractState, currentBlock) {
  const caregiver = contractState.caregivers.get(caregiverId)
  if (!caregiver) return false
  return caregiver.status === "verified" && caregiver.expirationDate > currentBlock
}

function getContractInfo(contractState) {
  return {
    paused: contractState.contractPaused,
    verificationFee: contractState.verificationFee,
    nextCaregiverId: contractState.nextCaregiverId,
    nextRequestId: contractState.nextRequestId,
  }
}
