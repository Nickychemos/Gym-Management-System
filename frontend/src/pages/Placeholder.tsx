import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  title: string
  hint?: string
}

/**
 * Stand-in for any page not yet implemented. Renders a clean empty card
 * with the page title and a hint about what the page will eventually do.
 */
export default function Placeholder({ title, hint }: Props) {
  return (
    <div>
      <h1 className="text-display font-semibold tracking-tight text-neutral-900 mb-1">
        {title}
      </h1>
      <p className="text-body text-neutral-600 mb-6">
        Coming soon — this surface is part of the Week 1 routing skeleton.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center">
            <div className="inline-flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            </div>
            <p className="text-h3 font-medium text-neutral-900 mb-1">
              Page reserved
            </p>
            <p className="text-small text-neutral-500">
              {hint ?? 'Implementation lands in the upcoming weeks.'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
