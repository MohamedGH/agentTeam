import { ClassifiedProblem, ProblemCategory, ProblemComplexity } from './types';

/**
 * ProblemClassifier
 * 
 * Analyzes and classifies software engineering and cognitive tasks into structured,
 * fine-grained operational profiles based on semantic, lexical, syntactic, and structural cues.
 * Never uses static model mappings or hardcoded routing tables.
 */
export class ProblemClassifier {
  /**
   * Classifies a task input into a rich ClassifiedProblem descriptor.
   */
  public classify(taskPrompt: string, context?: string): ClassifiedProblem {
    const text = `${taskPrompt || ''}\n${context || ''}`.trim();
    const lower = text.toLowerCase();

    // 1. Language and ecosystem detection
    const detectedLanguages = this.detectLanguages(lower);

    // 2. Extract technical constraints
    const constraints = this.extractConstraints(text, lower);

    // 3. Score categories based on structural indicators
    const scores = this.calculateCategoryScores(text, lower);

    // 4. Select highest scoring category with subcategory specialization
    const { category, subcategory, confidenceScore } = this.selectBestCategory(scores, lower);

    // 5. Evaluate complexity
    const complexity = this.evaluateComplexity(text, lower, category);

    // 6. Determine required capabilities
    const requiredCapabilities = this.determineRequiredCapabilities(category, complexity, lower, constraints);

    // 7. Estimate tokens
    const estimatedTokens = Math.max(200, Math.ceil(text.length / 3.5) + (complexity === 'EXTREME' ? 4000 : complexity === 'HIGH' ? 2500 : 1000));

    return {
      category,
      subcategory,
      complexity,
      requiredCapabilities,
      constraints,
      detectedLanguages,
      estimatedTokens,
      rawInputSnippet: taskPrompt.slice(0, 160),
      deterministicScore: Math.round(confidenceScore * 100) / 100,
    };
  }

  private detectLanguages(lower: string): string[] {
    const langs: string[] = [];
    if (/\b(typescript|ts|tsx|type\s+|interface\s+)\b/.test(lower)) langs.push('typescript');
    if (/\b(javascript|js|jsx|node\.js|node|npm)\b/.test(lower)) langs.push('javascript');
    if (/\b(python|py|def\s+|numpy|pandas)\b/.test(lower)) langs.push('python');
    if (/\b(rust|cargo|fn\s+|impl\s+|borrow|lifetime)\b/.test(lower)) langs.push('rust');
    if (/\b(golang|go\s+func|goroutine)\b/.test(lower)) langs.push('go');
    if (/\b(sql|postgres|select\s+.*from|inner\s+join)\b/.test(lower)) langs.push('sql');
    if (/\b(html|css|tailwind|scss)\b/.test(lower)) langs.push('html_css');
    return langs.length > 0 ? langs : ['generic_code'];
  }

  private extractConstraints(text: string, lower: string): string[] {
    const constraints: string[] = [];
    if (/(?:no|zero|without)\s+(?:external\s+)?(?:dependencies|deps|libraries|packages)/i.test(text)) {
      constraints.push('ZERO_EXTERNAL_DEPENDENCIES');
    }
    if (/pure\s+function(s)?|functional\s+programming|no\s+mutation|immutable/i.test(text)) {
      constraints.push('FUNCTIONAL_IMMUTABLE');
    }
    if (/backward(s)?\s+compatib(le|ility)|do\s+not\s+break|non-breaking/i.test(text)) {
      constraints.push('BACKWARD_COMPATIBLE');
    }
    if (/time\s+complexity|o\(1\)|o\(n\)|o\(log\s*n\)|latency|realtime|high\s+performance/i.test(text)) {
      constraints.push('STRICT_TIME_COMPLEXITY');
    }
    if (/space\s+complexity|memory\s+limit|o\(1\)\s+space/i.test(text)) {
      constraints.push('STRICT_SPACE_COMPLEXITY');
    }
    if (/idempotent|idempotence/i.test(text)) {
      constraints.push('IDEMPOTENT_EXECUTION');
    }
    if (/safe|sandbox|no\s+eval|sanitize|prevent\s+injection/i.test(text)) {
      constraints.push('SECURITY_SANDBOXED');
    }
    return constraints;
  }

  private calculateCategoryScores(text: string, lower: string): Record<ProblemCategory, number> {
    const scores: Record<ProblemCategory, number> = {
      CODE_GENERATION: 0.1,
      CODE_DEBUGGING: 0,
      REFACTORING: 0,
      ALGORITHM: 0,
      REASONING: 0,
      MATHEMATICS: 0,
      TEST_GENERATION: 0,
      TEST_FAILURE_ANALYSIS: 0,
      SECURITY: 0,
      ARCHITECTURE: 0,
      DOCUMENTATION: 0,
      DATA_ANALYSIS: 0,
      GENERAL_TASK: 0.05,
    };

    // DEBUGGING & ERROR ANALYSIS
    if (/\b(fix|bug|error|exception|crash|fails|failed|traceback|stacktrace|cannot\s+read\s+properties|nullpointer|undefined|issue|broken)\b/.test(lower)) {
      scores.CODE_DEBUGGING += 0.6;
    }
    if (/error\s+ts\d+|typeerror|referenceerror|syntaxerror|unhandledrejection/.test(lower)) {
      scores.CODE_DEBUGGING += 0.8;
      scores.TEST_FAILURE_ANALYSIS += 0.3;
    }

    // TEST FAILURE ANALYSIS
    if (/fail(ed|ing)\s+tests?|jest\s+failed|test\s+suite\s+failed|assert(ion)?\s+failed|expected.*received|junit|vitest/.test(lower)) {
      scores.TEST_FAILURE_ANALYSIS += 0.9;
    }

    // TEST GENERATION
    if (/\b(write\s+tests?|unit\s+tests?|integration\s+tests?|e2e\s+tests?|test\s+coverage|tdd|test\s+suite|mock\s+tests?)\b/.test(lower)) {
      scores.TEST_GENERATION += 0.85;
    }

    // SECURITY
    if (/\b(security|vulnerab(ility|le)|cve|injection|xss|csrf|path\s+traversal|sanitize|audit|permission|secret|hardcoded\s+key|exploit)\b/.test(lower)) {
      scores.SECURITY += 0.95;
    }

    // REFACTORING
    if (/\b(refactor|clean\s+up|restructure|extract\s+method|modularize|deduplicate|reduce\s+complexity|code\s+smell|modernize)\b/.test(lower)) {
      scores.REFACTORING += 0.85;
    }

    // ARCHITECTURE
    if (/\b(architect(ure)?|system\s+design|microservices?|event-driven|orchestrat(or|ion)|cqrs|hexagonal|clean\s+architecture|domain-driven|scaffolding)\b/.test(lower)) {
      scores.ARCHITECTURE += 0.85;
    }

    // ALGORITHM
    if (/\b(algorithm|sort(ing)?|graph|tree|dynamic\s+programming|dijkstra|binary\s+search|bfs|dfs|memoiz(ation|e)|complexity\s+o\(|hash\s*map)\b/.test(lower)) {
      scores.ALGORITHM += 0.85;
    }

    // MATHEMATICS
    if (/\b(math(ematics)?|calculus|matrix|matrices|probability|differential|integral|equation|eigen|statistics|variance|stochastic|combinatorics)\b/.test(lower)) {
      scores.MATHEMATICS += 0.9;
    }

    // REASONING / LOGIC
    if (/\b(reason(ing)?|deduce|infer|logic\s+puzzle|proof|induction|hypothes(is|ize)|evaluate\s+tradeoffs|critical\s+thinking)\b/.test(lower)) {
      scores.REASONING += 0.75;
    }

    // DATA ANALYSIS
    if (/\b(data\s+analysis|dataframe|dataset|aggregate|trend|correlation|regression|histogram|distribution|outlier)\b/.test(lower)) {
      scores.DATA_ANALYSIS += 0.8;
    }

    // DOCUMENTATION
    if (/\b(document(ation)?|readme|jsdoc|docstring|api\s+docs|swagger|openapi|markdown\s+guide|explain\s+how\s+to\s+use)\b/.test(lower)) {
      scores.DOCUMENTATION += 0.85;
    }

    // CODE GENERATION
    if (/\b(implement|create|build|write\s+a\s+(class|function|module|component|service|endpoint|api)|code\s+a)\b/.test(lower)) {
      scores.CODE_GENERATION += 0.65;
    }

    return scores;
  }

  private selectBestCategory(
    scores: Record<ProblemCategory, number>,
    lower: string
  ): { category: ProblemCategory; subcategory: string; confidenceScore: number } {
    let bestCategory: ProblemCategory = 'GENERAL_TASK';
    let maxScore = -1;

    for (const [cat, score] of Object.entries(scores) as [ProblemCategory, number][]) {
      if (score > maxScore) {
        maxScore = score;
        bestCategory = cat;
      }
    }

    if (maxScore < 0.25) {
      bestCategory = 'GENERAL_TASK';
      maxScore = 0.4;
    }

    // Derive specialized subcategory
    let subcategory = 'general';
    switch (bestCategory) {
      case 'CODE_DEBUGGING':
        subcategory = lower.includes('type') ? 'type_error' : lower.includes('async') ? 'concurrency_race' : 'runtime_logic';
        break;
      case 'SECURITY':
        subcategory = lower.includes('injection') ? 'injection_mitigation' : lower.includes('traversal') ? 'path_traversal' : 'vulnerability_remediation';
        break;
      case 'ARCHITECTURE':
        subcategory = lower.includes('orchestrat') ? 'workflow_orchestration' : lower.includes('api') ? 'api_boundary_design' : 'system_modularization';
        break;
      case 'ALGORITHM':
        subcategory = lower.includes('tree') || lower.includes('graph') ? 'graph_theory' : lower.includes('dynamic') ? 'dynamic_programming' : 'computation_optimization';
        break;
      case 'MATHEMATICS':
        subcategory = lower.includes('probab') || lower.includes('stat') ? 'probability_stats' : 'analytical_computation';
        break;
      case 'TEST_GENERATION':
        subcategory = lower.includes('integration') ? 'integration_suite' : 'unit_coverage';
        break;
      case 'REFACTORING':
        subcategory = lower.includes('smell') ? 'code_smell_reduction' : 'functional_transformation';
        break;
      case 'CODE_GENERATION':
        subcategory = lower.includes('api') || lower.includes('route') ? 'backend_api' : lower.includes('component') ? 'ui_component' : 'business_logic';
        break;
      default:
        subcategory = 'standard';
    }

    return { category: bestCategory, subcategory, confidenceScore: Math.min(1.0, maxScore) };
  }

  private evaluateComplexity(text: string, lower: string, category: ProblemCategory): ProblemComplexity {
    let complexityWeight = 0;

    // Length and depth
    if (text.length > 2500) complexityWeight += 3;
    else if (text.length > 1000) complexityWeight += 2;
    else if (text.length > 400) complexityWeight += 1;

    // Structural complexity keywords
    if (/\b(concurrency|distributed|consensus|atomic|mutex|deadlock|race\s+condition|websocket|streaming)\b/.test(lower)) {
      complexityWeight += 3;
    }
    if (/\b(recursive|backtracking|graph\s+traversal|np-hard|ast|compiler|interpreter|bytecode)\b/.test(lower)) {
      complexityWeight += 3;
    }
    if (/\b(multi-file|across\s+the\s+entire|full-stack|database\s+migration|zero-downtime)\b/.test(lower)) {
      complexityWeight += 2;
    }
    if (/\b(cryptograph|zero-knowledge|formal\s+verification|elliptic\s+curve|quantum)\b/.test(lower)) {
      complexityWeight += 4;
    }

    // Category intrinsic complexity
    if (category === 'ARCHITECTURE' || category === 'SECURITY') complexityWeight += 2;
    if (category === 'ALGORITHM' || category === 'MATHEMATICS') complexityWeight += 1;

    if (complexityWeight >= 7) return 'EXTREME';
    if (complexityWeight >= 4) return 'HIGH';
    if (complexityWeight >= 2) return 'MEDIUM';
    return 'LOW';
  }

  private determineRequiredCapabilities(
    category: ProblemCategory,
    complexity: ProblemComplexity,
    lower: string,
    constraints: string[]
  ): string[] {
    const caps = new Set<string>(['code_synthesis']);

    if (category === 'CODE_DEBUGGING' || category === 'TEST_FAILURE_ANALYSIS') {
      caps.add('fault_localization');
      caps.add('stacktrace_parsing');
    }
    if (category === 'SECURITY') {
      caps.add('vulnerability_analysis');
      caps.add('defense_in_depth');
    }
    if (category === 'ARCHITECTURE') {
      caps.add('system_modeling');
      caps.add('tradeoff_evaluation');
    }
    if (category === 'ALGORITHM' || category === 'MATHEMATICS') {
      caps.add('mathematical_rigor');
      caps.add('complexity_optimization');
    }
    if (category === 'TEST_GENERATION') {
      caps.add('test_oracle_generation');
      caps.add('edge_case_synthesis');
    }
    if (complexity === 'HIGH' || complexity === 'EXTREME') {
      caps.add('deep_reasoning');
      caps.add('large_context_window');
    }
    if (constraints.includes('ZERO_EXTERNAL_DEPENDENCIES')) {
      caps.add('standard_library_mastery');
    }

    return Array.from(caps);
  }
}

export const problemClassifier = new ProblemClassifier();
