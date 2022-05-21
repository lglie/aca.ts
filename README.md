# Aca.ts

Aca.ts is a node.js CLI based on Typescript and Knex.js. It could automatically syncs database schema according to a custom ORM. It could also automatically generates APIs for accessing the database. More importantly, it automatically creates frontend APIs through backend functions and the generated database APIs (like RPC), so frontend developers can easily access the backend without defining routing. The APIs is typescript, tips are very friendly when coding.

Use the class syntax of Typescript to define ORM:

- Define a root namespace to represent your database
- Define table with class (class name as table name)
- Define column and relationship with class property (property name as column name)
- Add constraints to table and column with decorators

# An example could be found below:

example-blog.ts

```typescript
namespace db {
  export class user {
    id: id
    @$_.unique name: string
    age?: int
    married = false
    profile?: profile
    posts: post[]
  }

  export class profile {
    id: id
    password: string
    @$_.foreign('userId') user: user
  }

  export class post {
    id: id
    content: string
    score: float
    @$_.foreign('userId') user: user
    categories: category[]
  }

  export class category {
    id: id
    name: string
    @$_.foreign('categoryId') parent?: category
    children: category[]
    posts: post[]
  }
}
```

# Install

```bash
npm install -g aca.ts
```

# Usage

1. Create a aca project:

```bash
$ aca create <dirname>
$ cd <dirname>
```

2. Open .aca directory, copy your custom ORM file into that directory, add this file name to config.json/orm field.

<img with="80px" hight="180px" src="https://www.ts.center/static/config.jpg">

3. Use the following method to create aca.ts apps:

Create a backend app:

```bash
$ aca server <dirname> --framework <framework or faas>
  framework: koa, express, faas: amazon, azure, ali, google, tencent
```

Create a frontend app(react app by create-react-app):

```bash
$ aca client
```

Add self app to the project:

```bash
$ aca add <dirname> <--server or --client> --apiDir <path>
  path default: src/aca.api
```

4. Generate api

```bash
$ aca up
```

Then the database, frontend, and backend are all set up, you can start your application now. Happy coding!

#

> <font color=red>The generated backend APIs usage example are as follows:</font> <img with="80px" hight="180px" src="https://www.ts.center/static/server-koa-index.jpg">

#

> <font color=red>The generated frontend APIs usage example are as follows:</font> <img with="80px" hight="180px" src="https://www.ts.center/static/client-react-app.jpg">

#

# Supported databases for now:

- PostgreSQL
- MSSQL
- Oracle
- Better-Sqlite3
