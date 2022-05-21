export const indexExpress = (consts: string) => `import express from 'express'
import { ${consts} } from './aca.server'

const app = express()
app.use(async (req, res, next) => {
  const reqBody = req.body
  const rtn = await $ApiBridge(req, reqBody)
  res.end(rtn)
})

app.listen(8080, 'http://localhost')
`
