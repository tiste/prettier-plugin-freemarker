const parsers = {
  freemarker: {
    parse: (text) => {
      // Basic AST structure for now
      return {
        type: "freemarker",
        body: text,
      };
    },
    astFormat: "freemarker-ast",
    locStart: (_node) => 0,
    locEnd: (_node) => 0,
  },
};

module.exports = parsers;
