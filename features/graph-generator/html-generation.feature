Feature: html-generation
  Produce a self-contained HTML string with all specs, styles, and scripts embedded.

  Scenario: Generate complete HTML document
    Given an array of parsed specs
    When generateHTML is called
    Then the result is a valid HTML string with DOCTYPE, head, and body

  Scenario: Embed specs as JSON
    Given specs contain dependency and feature data
    When generateHTML is called
    Then the spec array is serialized as a JSON literal inside a script tag

  Scenario: Include CDN scripts for D3 and marked
    Given any call to generateHTML
    When HTML is produced
    Then script tags reference D3.js v7 and marked.js from CDN

  Scenario: Inline all CSS
    Given the dark neo4j-inspired theme
    When HTML is produced
    Then all styles are embedded in a style tag — no external stylesheet

  Scenario: Include SSE client in dev mode
    Given liveReload option is true
    When HTML is produced
    Then connectSSE() and updateGraph() functions are embedded in the script

  Scenario: Exclude SSE client in static mode
    Given liveReload option is false or omitted
    When HTML is produced
    Then no SSE or editing code is included

  Scenario: Include editing UI in dev mode
    Given liveReload is true
    When HTML is produced
    Then edit buttons and save handlers for spec bodies and feature files are embedded

  Scenario: No external assets
    Given the generated HTML
    When loaded in a browser
    Then only CDN scripts are fetched — no other external requests
