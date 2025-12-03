const printers = {
  "freemarker-ast": {
    print: (path) => {
      const node = path.getValue();
      // For now, just return the original content
      return node.body;
    },
  },
};

module.exports = printers;
