Feature: feature-write-back
  Update feature file content on disk from browser edits.

  Scenario: Update feature file via PUT
    Given a PUT request to /api/features/auth/login.feature with { content: "Feature: ..." }
    When the request is processed
    Then the feature file at projectRoot/features/auth/login.feature is overwritten

  Scenario: Return 404 for unknown spec or missing features path
    Given the spec name doesn't exist or has no features path
    When the request is processed
    Then 404 is returned with { error: "Spec or features path not found" }

  Scenario: Return 500 on write failure
    Given the file system write fails
    When the request is processed
    Then 500 is returned with the error message

  Scenario: Trigger re-parse via file watcher
    Given a feature file is written
    When the write completes
    Then the file watcher detects the change and triggers a re-parse cycle
