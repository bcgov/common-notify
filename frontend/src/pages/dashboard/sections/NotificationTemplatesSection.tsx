import { useEffect } from 'react'
import type { FC } from 'react'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchTemplates } from '@/redux/thunks/templates.thunks'
import { Button } from '@bcgov/design-system-react-components'
import PageSubHeading from '../../../components/PageSubHeading'
import { Link, useNavigate } from '@tanstack/react-router'
import { useCstarRoles } from '@/hooks/useCstarRoles'

/**
 * Used on the Dashboard page
 */
export const NotificationTemplatesSection: FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const templates = useAppSelector((state) => state.templates.items)
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const { canEdit } = useCstarRoles()

  useEffect(() => {
    dispatch(fetchTemplates())
  }, [dispatch, selectedTenant])

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
          {templates.slice(0, 2).map((template) => (
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
