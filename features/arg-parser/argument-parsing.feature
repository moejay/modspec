Feature: argument-parsing
  Parse raw CLI arguments into a structured options object without side effects.

  Scenario: Extract spec directory from first positional argument
    Given the argument array is ["./spec/"]
    When arguments are parsed
    Then specDir is "./spec/" and mode is "serve"

  Scenario: Parse --output flag with file path
    Given the argument array includes "--output graph.html"
    When arguments are parsed
    Then mode is "static" and outputPath is "graph.html"

  Scenario: Parse short -o flag
    Given the argument array includes "-o out.html"
    When arguments are parsed
    Then mode is "static" and outputPath is "out.html"

  Scenario: Error when --output has no path
    Given the argument array ends with "--output"
    When arguments are parsed
    Then an error is returned: "--output requires a file path"

  Scenario: Parse --port with valid number
    Given the argument array includes "--port 8080"
    When arguments are parsed
    Then port is 8080

  Scenario: Error when --port has non-numeric value
    Given the argument array includes "--port abc"
    When arguments are parsed
    Then an error is returned: "--port requires a number"

  Scenario: Parse -y flag for auto-confirm
    Given the argument array includes "-y"
    When arguments are parsed
    Then yes is true

  Scenario: Parse --yes flag for auto-confirm
    Given the argument array includes "--yes"
    When arguments are parsed
    Then yes is true

  Scenario: Return help when --help is present
    Given the argument array includes "--help"
    When arguments are parsed
    Then help is true

  Scenario: Return help when no arguments given
    Given the argument array is empty
    When arguments are parsed
    Then help is true

  Scenario: Default port when not specified
    Given the argument array is ["./spec/"]
    When arguments are parsed
    Then port defaults to 3333
