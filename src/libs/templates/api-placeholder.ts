export const apiPlaceholder = (
  exp: string[]
) => `// This file will be automatically updated after running aca up
${exp.map((v) => `export const ${v} = null`).join('\n')}
`
