export interface QualityGateInput {
  sessionStatus?: string | null;
  executionStatus?: string | null;
  testsPassed?: boolean | null;
  reviewExecuted?: boolean | null;
  reviewApproved?: boolean | null;
}

export interface QualityGateEvaluation {
  authorized: boolean;
  violations: string[];
  reason?: string;
}

/**
 * Strict Quality Gate Invariant:
 * Git operations (commit, push, pull request creation, repository creation) are authorized ONLY and STRICTLY if:
 * 1. sessionStatus === 'COMPLETED'
 * 2. executionStatus === 'COMPLETED'
 * 3. testsPassed === true
 * 4. reviewExecuted === true (if provided or implicit)
 * 5. reviewApproved === true
 *
 * Any undefined, null, false, or non-matching value immediately fails the gate and forbids Git operations.
 */
export function evaluateQualityGate(input?: QualityGateInput | null): QualityGateEvaluation {
  const violations: string[] = [];

  if (!input) {
    return {
      authorized: false,
      violations: ['No Quality Gate parameters provided'],
      reason: 'Quality Gate Refusal: Git operations forbidden. No Quality Gate parameters provided.',
    };
  }

  if (input.sessionStatus !== 'COMPLETED') {
    violations.push(
      `sessionStatus must strictly be 'COMPLETED' (received: ${input.sessionStatus === undefined ? 'undefined' : JSON.stringify(input.sessionStatus)})`
    );
  }

  if (input.executionStatus !== 'COMPLETED') {
    violations.push(
      `executionStatus must strictly be 'COMPLETED' (received: ${input.executionStatus === undefined ? 'undefined' : JSON.stringify(input.executionStatus)})`
    );
  }

  if (input.testsPassed !== true) {
    violations.push(
      `testsPassed must strictly be true (tests failed or not verified, received: ${input.testsPassed === undefined ? 'undefined' : JSON.stringify(input.testsPassed)})`
    );
  }

  if (input.reviewExecuted !== undefined && input.reviewExecuted !== true) {
    violations.push(
      `reviewExecuted must strictly be true (review not executed, received: ${input.reviewExecuted === undefined ? 'undefined' : JSON.stringify(input.reviewExecuted)})`
    );
  }

  if (input.reviewApproved !== true) {
    violations.push(
      `reviewApproved must strictly be true (received: ${input.reviewApproved === undefined ? 'undefined' : JSON.stringify(input.reviewApproved)})`
    );
  }

  if (violations.length > 0) {
    return {
      authorized: false,
      violations,
      reason: `Quality Gate Refusal: Git operations forbidden. Violations: ${violations.join('; ')}`,
    };
  }

  return {
    authorized: true,
    violations: [],
  };
}

export function isQualityGateAuthorized(input?: QualityGateInput | null): boolean {
  return evaluateQualityGate(input).authorized;
}
