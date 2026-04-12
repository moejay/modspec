Feature: spec-write-back
  Update spec body on disk while preserving YAML frontmatter.

  Scenario: Update spec body via PUT
    Given a PUT request to /api/specs/auth/body with { body: "# New content" }
    When the request is processed
    Then the auth.md file is rewritten with original frontmatter and new body

  Scenario: Preserve all frontmatter fields
    Given a spec file has name, description, group, tags, depends_on, and features
    When the body is updated
    Then all frontmatter fields remain unchanged

  Scenario: Return 404 for unknown spec name
    Given a PUT request for a spec name not in the file map
    When the request is processed
    Then 404 is returned with { error: "Spec not found" }

  Scenario: Return 500 on write failure
    Given the file system write fails
    When the request is processed
    Then 500 is returned with the error message
