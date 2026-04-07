Feature: Repo Onboarding
  Adding a repository to the system.

  Scenario: Onboard repo by owner/repo
    Given no repos are tracked
    When I add "owner/repo"
    Then the repo is tracked

  Scenario: Onboard repo by GitHub URL
    Given no repos are tracked
    When I add "https://github.com/owner/repo"
    Then the repo is tracked

  Scenario: Reject duplicate repo
    Given "owner/repo" is already tracked
    When I add "owner/repo"
    Then an error is returned
