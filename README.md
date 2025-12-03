# prettier-plugin-freemarker

A [Prettier](https://prettier.io/) plugin for formatting [FreeMarker](https://freemarker.apache.org/) template files (`.ftl`).

## Installation

```bash
npm install --save-dev prettier prettier-plugin-freemarker
```

## Usage

### Command Line

Once installed, Prettier will automatically detect and use the plugin for `.ftl` files:

```bash
npx prettier --write "**/*.ftl"
```

You can also explicitly specify the plugin:

```bash
npx prettier --plugin prettier-plugin-freemarker --write "**/*.ftl"
```

### Configuration

Add the plugin to your Prettier configuration file (`.prettierrc`, `.prettierrc.json`, etc.):

```json
{
  "plugins": ["prettier-plugin-freemarker"]
}
```

### Programmatic Usage

```javascript
const prettier = require("prettier");
const plugin = require("prettier-plugin-freemarker");

const formatted = await prettier.format(code, {
  parser: "freemarker",
  plugins: [plugin],
});
```

## How It Works

This plugin extends Prettier with support for FreeMarker templates by providing:

- **Languages**: Registers the FreeMarker language with `.ftl` file extension
- **Parsers**: Parses FreeMarker template syntax into an AST
- **Printers**: Converts the AST back to formatted code

## Supported File Extensions

- `.ftl`

## License

MIT
