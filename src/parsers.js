const parsers = {
  freemarker: {
    parse: (text) => {
      return {
        type: "freemarker",
        body: text,
      };
    },
    astFormat: "freemarker-ast",
    locStart: () => 0,
    locEnd: (text) => text.length,
  },
};

module.exports = parsers;
