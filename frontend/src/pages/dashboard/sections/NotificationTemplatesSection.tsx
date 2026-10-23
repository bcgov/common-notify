import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useAppSelector } from '@/redux/hooks'
import { getTemplates } from '@/api/templates.api'
import type { TemplateResponse } from '@/api/templates.api'
import { Button } from '@bcgov/design-system-react-components'
import PageSubHeading from '../../../components/PageSubHeading'
import { Link, useNavigate } from '@tanstack/react-router'
import { useCstarRoles } from '@/hooks/useCstarRoles'

/**
 * Used on the Dashboard page
 */
export const NotificationTemplatesSection: FC = () => {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<TemplateResponse[]>([])
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const { canEdit } = useCstarRoles()

  // Fetch first two templates directly
  useEffect(() => {
    if (!selectedTenant) return

    let active = true
    // 1 page with 2 enties since we only display the latest 2 templates
    getTemplates(1, 2)
      .then((response) => {
        if (active) setTemplates(response.data)
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [selectedTenant])

  return (
    <section className="page__section">
      <PageSubHeading title="Notification Templates" />
      <div className="page__section-body">
        <Button
          variant="primary"
          onPress={() => navigate({ to: '/template-create' })}
          isDisabled={!canEdit}
        >
          Create New Template
        </Button>
        <ul className="list-unstyled m-0 d-flex flex-column gap-2">
          {templates.map((template) => (
            <li key={template.id}>
              <Link
                to="/template-edit/$templateId"
                params={{ templateId: String(template.id) }}
                style={{ color: 'black' }}
              >
                {template.name}
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/templates" style={{ color: '#255A90' }}>
          Browse existing templates
        </Link>
      </div>
    </section>
  )
}
