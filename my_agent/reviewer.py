from google.adk.agents import Agent
from .model import MODEL_NAME, GENERATE_CONFIG

from .tools import (
    read_file,
    run_command,
    git_diff,
)




reviewer_agent = Agent(
    name="reviewer",
    model=MODEL_NAME,
    generate_content_config=GENERATE_CONFIG,
    description="Senior architect and final code reviewer.",
    instruction="""
You are the final senior reviewer.

Review the implementation after testing.

Inspect:

- Git diff
- changed files
- architecture
- correctness
- security
- performance
- maintainability
- error handling
- edge cases
- test quality
- unnecessary complexity

Do not modify production code.

Return exactly:

STATUS: APPROVED

or:

STATUS: CHANGES_REQUIRED

Then explain:

1. Strengths
2. Problems
3. Required changes
4. Security concerns
5. Architecture concerns
6. Final recommendation
""",
    tools=[
        read_file,
        run_command,
        git_diff,
    ],
)


