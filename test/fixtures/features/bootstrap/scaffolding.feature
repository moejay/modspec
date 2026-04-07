@bootstrap
Feature: Project Scaffolding
  The project compiles and all tooling works from a fresh checkout.

  Scenario: Clean build with zero warnings
    Given a fresh clone of the repository
    When I run the build command
    Then the build succeeds

  Scenario: All dependencies resolve
    Given a fresh clone of the repository
    When I install dependencies
    Then all dependencies resolve successfully
