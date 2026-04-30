Feature: subcommand-parsing
  Recognize subcommand keywords as the first positional argument and route to the corresponding mode.

  Scenario: Parse list subcommand
    Given the argument array is ["list", "./spec/"]
    When arguments are parsed
    Then mode is "list" and specDir is "./spec/"

  Scenario: Parse show subcommand with spec name
    Given the argument array is ["show", "./spec/", "auth"]
    When arguments are parsed
    Then mode is "show" and specDir is "./spec/" and name is "auth"

  Scenario: Error when show is missing spec name
    Given the argument array is ["show", "./spec/"]
    When arguments are parsed
    Then an error is returned: "show requires a spec name"

  Scenario: Parse features subcommand without name lists all
    Given the argument array is ["features", "./spec/"]
    When arguments are parsed
    Then mode is "features" and specDir is "./spec/" and name is null

  Scenario: Parse features subcommand with spec name
    Given the argument array is ["features", "./spec/", "auth"]
    When arguments are parsed
    Then mode is "features" and specDir is "./spec/" and name is "auth"

  Scenario: Parse deps subcommand with spec name
    Given the argument array is ["deps", "./spec/", "auth"]
    When arguments are parsed
    Then mode is "deps" and specDir is "./spec/" and name is "auth"

  Scenario: Error when deps is missing spec name
    Given the argument array is ["deps", "./spec/"]
    When arguments are parsed
    Then an error is returned: "deps requires a spec name"

  Scenario: Parse validate subcommand
    Given the argument array is ["validate", "./spec/"]
    When arguments are parsed
    Then mode is "validate" and specDir is "./spec/"

  Scenario: Parse --json flag with subcommand
    Given the argument array is ["list", "./spec/", "--json"]
    When arguments are parsed
    Then mode is "list" and json is true

  Scenario: json defaults to false when flag absent
    Given the argument array is ["list", "./spec/"]
    When arguments are parsed
    Then json is false

  Scenario: Bare path falls through to serve mode
    Given the argument array is ["./spec/"]
    When arguments are parsed
    Then mode is "serve"

  Scenario: Path that looks like a subcommand keyword but with prefix is treated as path
    Given the argument array is ["./list/"]
    When arguments are parsed
    Then mode is "serve" and specDir is "./list/"
