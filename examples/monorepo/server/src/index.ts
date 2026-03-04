import express from 'express'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { createAuth } from '@authcore/express'

const prisma = new PrismaClient()
const app = express()
const port = Number(process.env.PORT) || 3000

app.use(cookieParser())
app.use(express.json())

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET || 'dev-secret-change-me-in-production!!' },
})

app.use('/auth', auth.router({ useCookies: true }))

app.get('/api/me', auth.middleware(), (req, res) => {
  res.json({ user: req.user })
})

// Serve static client build in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(import.meta.dirname, '../../client/dist')
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
