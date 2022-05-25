export const apiPlaceholder = (
  exp: string[]
) => `// 本文件在运行：aca up 后会自动更新
${exp.map((v) => `export const ${v} = null`).join('\n')}
`
