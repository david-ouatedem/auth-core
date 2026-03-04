import * as p from '@clack/prompts'
import { scaffold } from './scaffold.js'

export async function main() {
  p.intro('create-authcore-app')

  const project = await p.group(
    {
      name: () =>
        p.text({
          message: 'Project name:',
          placeholder: 'my-authcore-app',
          defaultValue: 'my-authcore-app',
          validate: (value): string | undefined => {
            if (!value) return 'Project name is required'
            if (/[^a-z0-9\-_.]/.test(value)) return 'Use lowercase letters, numbers, hyphens, underscores, or dots'
            return undefined
          },
        }),
      template: () =>
        p.select({
          message: 'Select a template:',
          options: [
            { value: 'api-only', label: 'API + Frontend', hint: 'Express backend + React frontend (JWT/Bearer)' },
            { value: 'monorepo', label: 'Monorepo', hint: 'Express + React in one repo (cookie auth)' },
            { value: 'frontend-only', label: 'Frontend Only', hint: 'React app connecting to an existing API' },
          ],
        }),
      packageManager: () =>
        p.select({
          message: 'Package manager:',
          initialValue: 'pnpm',
          options: [
            { value: 'pnpm', label: 'pnpm' },
            { value: 'npm', label: 'npm' },
            { value: 'yarn', label: 'yarn' },
          ],
        }),
    },
    {
      onCancel: () => {
        p.cancel('Operation cancelled.')
        process.exit(0)
      },
    }
  )

  const s = p.spinner()
  s.start('Scaffolding project...')

  await scaffold({
    name: project.name as string,
    template: project.template as string,
    packageManager: project.packageManager as string,
  })

  s.stop('Project scaffolded!')

  const runCmd = project.packageManager === 'npm' ? 'npm run' : project.packageManager as string

  const steps = [
    `cd ${project.name}`,
  ]

  if (project.template === 'api-only') {
    steps.push(
      `cd backend && cp .env.example .env  # Edit with your settings`,
      `${project.packageManager} install`,
      `npx prisma db push`,
      `${runCmd} dev`,
      `# In another terminal:`,
      `cd ../frontend && ${project.packageManager} install && ${runCmd} dev`,
    )
  } else if (project.template === 'monorepo') {
    steps.push(
      `cp .env.example .env  # Edit with your settings`,
      `cd server && ${project.packageManager} install && npx prisma db push && cd ..`,
      `cd client && ${project.packageManager} install && cd ..`,
      `# Terminal 1: cd server && ${runCmd} dev`,
      `# Terminal 2: cd client && ${runCmd} dev`,
    )
  } else {
    steps.push(
      `cp .env.example .env  # Set VITE_API_URL`,
      `${project.packageManager} install`,
      `${runCmd} dev`,
    )
  }

  p.note(steps.join('\n'), 'Next steps')

  p.outro('Happy building!')
}
