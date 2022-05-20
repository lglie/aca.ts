import * as Cst from '../constant'

export const indexKoa = (consts: string) => `import Koa from 'koa'
import bodyParser from 'koa-body'
import cors from 'koa-cors'
import { ${consts} } from './${Cst.DefaultServerApiDir}'

export const app = new Koa()
app.use(cors())
app.use(bodyParser())
app.use(async (ctx, next) => {
  const reqBody = ctx.request.body
  console.log(\`req:\\n\${JSON.stringify(reqBody)}\`)
  const res = await $ApiBridge(ctx, reqBody)
  console.log(\`res:\\n\${JSON.stringify(res)}\`)
  ctx.body = res
})

app.listen({ port: 8080 }, () =>
  console.log('Server ready at http://localhost:8080')
)
`
