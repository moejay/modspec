Feature: spec-file-parsing
  Parse a single markdown spec file into a structured object.

  Scenario: Parse valid spec with all fields
    Given a .md file with name, description, group, tags, depends_on, and features in frontmatter
    When parseSpecFile is called
    Then a spec object is returned with all fields populated and body trimmed

  Scenario: Parse minimal spec with only name
    Given a .md file with only name in frontmatter
    When parseSpecFile is called
    Then description defaults to "", group to "", tags to [], depends_on to [], features to ""

  Scenario: Return null for missing name
    Given a .md file with frontmatter but no name field
    When parseSpecFile is called
    Then null is returned

  Scenario: Normalize string dependency
    Given depends_on contains a plain string "config"
    When parseSpecFile is called
    Then the entry is normalized to { name: "config", uses: [] }

  Scenario: Normalize object dependency with uses
    Given depends_on contains { name: "auth", uses: ["login", "session"] }
    When parseSpecFile is called
    Then the entry is preserved as { name: "auth", uses: ["login", "session"] }

  Scenario: Filter invalid dependency entries
    Given depends_on contains an object without a name field
    When parseSpecFile is called
    Then the invalid entry is filtered out
