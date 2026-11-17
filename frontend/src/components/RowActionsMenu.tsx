import type { FC } from 'react'
import { Button, Menu, MenuTrigger } from '@bcgov/design-system-react-components'
import MoreVertIcon from '@mui/icons-material/MoreVert'

export interface RowAction {
  id: string
  label: string
}

export interface RowActionGroup {
  id: string
  actions: readonly RowAction[]
}

interface RowActionsMenuProps {
  /** Names the button, and so the row: "Actions for Parks Booking". */
  label: string
  /** Shown in order, with a separator between groups; empty groups are left out. */
  groups: readonly RowActionGroup[]
  onAction: (id: string) => void
}

/** A table row's actions behind one ⋮ button, so each row has a single control. */
const RowActionsMenu: FC<RowActionsMenuProps> = ({ label, groups, onAction }) => {
  const sections = groups
    .filter((group) => group.actions.length > 0)
    .map((group) => ({
      id: group.id,
      items: group.actions.map((action) => ({ id: action.id, label: action.label })),
    }))

  return (
    <MenuTrigger>
      <Button variant="tertiary" size="small" isIconButton aria-label={label}>
        <MoreVertIcon fontSize="small" />
      </Button>
      <Menu sections={sections} placement="bottom end" onAction={(key) => onAction(String(key))} />
    </MenuTrigger>
  )
}

export default RowActionsMenu
