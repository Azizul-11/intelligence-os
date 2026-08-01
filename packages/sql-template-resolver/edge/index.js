// src/sql-template-resolver.ts
var SqlTemplateResolver = class {
  constructor(templates) {
    this.templates = templates;
  }
  templates;
  resolve(id) {
    const template = this.templates.find((t) => t.id === id) ?? null;
    return {
      found: template !== null,
      template
    };
  }
};
export {
  SqlTemplateResolver
};
