import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import PageHeading from '@/components/PageHeading'
import EventsTabBar from './components/EventsTabBar'
import type { EventsTabId } from './components/EventsTabBar'
import EventsTab from './sections/EventsTab'
import type { EventSettingsValues } from './sections/EventsTab'
import EventsEmailTab, { UNSAVED_EMAIL_CHANGES_MESSAGE } from './sections/EventsEmailTab'
import type { EmailSettingsValues } from './utils/emailSettings'
import EventsSmsTab, { UNSAVED_SMS_CHANGES_MESSAGE } from './sections/EventsSmsTab'
import type { SmsSettingsValues } from './sections/EventsSmsTab'
import EventsThirdPartyTab from './sections/EventsThirdPartyTab'
import UnsavedChanges from '@/components/UnsavedChanges'
import {
  getEventById,
  updateEvent,
  updateEventEmailSettings,
  deactivateEventEmailChannel,
  updateEventSmsSettings,
  deactivateEventSmsChannel,
} from '@/api/events.api'
import type { EventResponse } from '@/api/events.api'
import { showErrorToast, showSuccessToast } from '@/redux/utils/toastUtils'
import { useCstarRoles } from '@/hooks/useCstarRoles'
import { useCstarGroups } from '@/hooks/useCstarGroups'
import { useFeatureFlag } from '@/config/featureFlags/useFeatureFlag'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchApprovedEmailLogos, fetchSettings } from '@/redux/thunks/settings.thunks'
import '@/scss/components/events.scss'

interface EditEventProps {
  eventId: string
  /** Tab to open on, e.g. when the saved page hands back to its channel's settings. */
  initialTab?: EventsTabId
  /** Opens an active channel on its form instead of handing off to the saved page. */
  editChannel?: boolean
}

const EditEvent: FC<EditEventProps> = ({
  eventId,
  initialTab = 'settings',
  editChannel = false,
}) => {
  const { canEdit } = useCstarRoles()
  // Fetched here rather than in the email tab, the same way the tenant's logos and default sender
  // are: the tab takes everything outside its own form as a prop.
  const cstarGroups = useCstarGroups()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const defaultSenderEmail = useAppSelector((state) => state.tenantSettings.defaultSenderEmail)
  const approvedLogos = useAppSelector((state) => state.emailSettings.approvedLogos)
  const tenantShowsHeaderTitle = useAppSelector(
    (state) => state.emailSettings.useCustomEmailHeader ?? false,
  )
  const tenantEmailLogoId = useAppSelector((state) => state.emailSettings.emailLogoId)
  const tenantName = useAppSelector((state) => state.tenant.selectedTenant?.name)
  const smsNotificationsEnabled = useAppSelector(
    (state) => state.smsSettings?.smsNotificationsEnabled,
  )
  const selectedTenantId = useAppSelector((state) => state.tenant.selectedTenant?.id)
  const smsFeatureEnabled = useFeatureFlag('sms_notifications', selectedTenantId)
  const internationalSmsFlag = useFeatureFlag('international_sms', selectedTenantId)
  const internationalSmsEnabled = useAppSelector(
    (state) => state.smsSettings?.internationalSmsEnabled,
  )
  const [requestedTab, setRequestedTab] = useState<EventsTabId>(initialTab)
  // Also guard direct tab entry and a flag being disabled while the page is open.
  const selectedTab = requestedTab === 'sms' && !smsFeatureEnabled ? 'settings' : requestedTab
  const [event, setEvent] = useState<EventResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Each tab keeps its own form state and is unmounted when another is opened, so leaving the
  // email tab mid-edit drops the edits. The tab reports when it has any; the switch that would
  // discard them waits here until it has been confirmed.
  const [emailHasUnsavedChanges, setEmailHasUnsavedChanges] = useState(false)
  const [smsHasUnsavedChanges, setSmsHasUnsavedChanges] = useState(false)
  const [pendingTab, setPendingTab] = useState<EventsTabId | null>(null)
  // Only the saved page's "Edit settings" opens an active channel on its form; any other way
  // onto the channel's tab shows the saved settings, so leaving the tab drops this again.
  const [channelEditing, setChannelEditing] = useState(editChannel)
  const savedChannel =
    (selectedTab === 'email' && event?.emailSettings?.active === true) ||
    (selectedTab === 'sms' && event?.smsSettings?.active === true)
      ? selectedTab
      : null
  const showSaved = !channelEditing && savedChannel !== null

  // Replaced rather than pushed, so Back from the saved page does not land here and bounce.
  useEffect(() => {
    if (showSaved) {
      void navigate({
        to: '/events/$eventId/saved',
        params: { eventId },
        search: { channel: savedChannel },
        replace: true,
      })
    }
  }, [showSaved, savedChannel, eventId, navigate])

  // Tenant defaults for the email tab's sender field and header; failures aren't surfaced.
  // Waits for a selected tenant (it can arrive after mount) and re-runs when it changes.
  useEffect(() => {
    if (!selectedTenantId) return

    void dispatch(fetchSettings())
    void dispatch(fetchApprovedEmailLogos())
  }, [dispatch, selectedTenantId])

  // The page owns the single event fetch, so the title, breadcrumb and every tab read
  // from one request and switching tabs re-fetches nothing. The route keys this component by
  // eventId, so a fresh mount (and fresh useState(null)) is what resets event/loadError between
  // events.
  //
  // Events are tenant-scoped, so this waits for a selected tenant and re-runs when it changes.
  // Switching tenants re-fetches: the event is replaced on success, and dropped on failure so
  // the other tenant's event does not stay on screen behind the error.
  useEffect(() => {
    if (!selectedTenantId) return

    let active = true

    getEventById(eventId)
      .then((loaded) => {
        if (active) {
          setEvent(loaded)
          setLoadError(null)
        }
      })
      .catch((error) => {
        if (active) {
          setEvent(null)
          setLoadError(error instanceof Error ? error.message : 'Failed to load event')
        }
      })

    return () => {
      active = false
    }
  }, [eventId, selectedTenantId])

  function handleSelectTab(tab: EventsTabId) {
    if (tab === 'sms' && !smsFeatureEnabled) return
    if (
      (selectedTab === 'email' && emailHasUnsavedChanges) ||
      (selectedTab === 'sms' && smsHasUnsavedChanges)
    ) {
      setPendingTab(tab)
      return
    }
    setRequestedTab(tab)
    setChannelEditing(false)
  }

  function leavePendingTab() {
    if (pendingTab) setRequestedTab(pendingTab)
    setChannelEditing(false)
    setEmailHasUnsavedChanges(false)
    setSmsHasUnsavedChanges(false)
    setPendingTab(null)
  }

  async function handleSave(values: EventSettingsValues) {
    try {
      const updated = await updateEvent(eventId, values)
      // Re-sync to exactly what was persisted; this also moves the tab's change baseline.
      // General event updates do not include the detail-only tenant sender lookup.
      setEvent((previous) => ({ ...updated, senderPhoneNumber: previous?.senderPhoneNumber }))
      showSuccessToast('Event updated successfully')
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Failed to update event')
    }
  }

  // Errors and success messages are surfaced by the channel tabs themselves, so these just
  // persist and re-sync state - failures propagate up to the tab's own try/catch.
  async function handleSaveEmailSettings(values: EmailSettingsValues) {
    const updated = await updateEventEmailSettings(eventId, {
      active: values.active,
      senderEmail: values.senderEmail || null,
      templateId: values.templateId,
      to: values.to,
      cc: values.cc,
      bcc: values.bcc,
      cstarGroupIdsTo: values.cstarGroupIdsTo,
      cstarGroupIdsCc: values.cstarGroupIdsCc,
      cstarGroupIdsBcc: values.cstarGroupIdsBcc,
      useCustomHeader: values.useCustomHeader,
      headerLogoId: values.headerLogoId,
      headerTitle: values.headerTitle || null,
    })
    setEvent(updated)
    // Saved channel settings hand off to their own page, which confirms what was saved and
    // carries on to sending a test notification.
    void navigate({
      to: '/events/$eventId/saved',
      params: { eventId },
      search: { channel: 'email' },
    })
  }

  async function handleDeactivateEmail() {
    const updated = await deactivateEventEmailChannel(eventId)
    setEvent(updated)
  }

  async function handleSaveSmsSettings(values: SmsSettingsValues) {
    const updated = await updateEventSmsSettings(eventId, {
      active: values.active,
      templateId: values.templateId,
      to: values.to,
    })
    setEvent(updated)
    void navigate({ to: '/events/$eventId/saved', params: { eventId }, search: { channel: 'sms' } })
  }

  async function handleDeactivateSms() {
    const updated = await deactivateEventSmsChannel(eventId)
    setEvent(updated)
  }

  function renderTabContent() {
    if (loadError) return <div className="alert alert-danger">{loadError}</div>

    if (!event || showSaved) return <p className="events__help">Loading event...</p>

    if (selectedTab === 'settings')
      return (
        <EventsTab
          values={{ name: event.name, description: event.description }}
          onSave={handleSave}
          isDisabled={!canEdit}
        />
      )

    if (selectedTab === 'email')
      return (
        // The email channel starts disabled until the tab has been saved with it switched on.
        <EventsEmailTab
          values={{
            active: event.emailSettings?.active ?? false,
            senderEmail: event.emailSettings?.senderEmail ?? '',
            templateId: event.emailSettings?.templateId ?? null,
            to: event.emailSettings?.to ?? [],
            cc: event.emailSettings?.cc ?? [],
            bcc: event.emailSettings?.bcc ?? [],
            cstarGroupIdsTo: event.emailSettings?.cstarGroupIdsTo ?? [],
            cstarGroupIdsCc: event.emailSettings?.cstarGroupIdsCc ?? [],
            cstarGroupIdsBcc: event.emailSettings?.cstarGroupIdsBcc ?? [],
            useCustomHeader: event.emailSettings?.useCustomHeader ?? false,
            headerLogoId: event.emailSettings?.headerLogoId ?? null,
            headerTitle: event.emailSettings?.headerTitle ?? '',
          }}
          onSave={handleSaveEmailSettings}
          onDeactivate={handleDeactivateEmail}
          isDisabled={!canEdit}
          isConfigured={event.emailSettings !== null}
          defaultSenderEmail={defaultSenderEmail}
          approvedLogos={approvedLogos}
          tenantEmailLogoId={tenantEmailLogoId}
          tenantShowsHeaderTitle={tenantShowsHeaderTitle}
          tenantName={tenantName}
          onUnsavedChangesChange={setEmailHasUnsavedChanges}
          cstarGroups={cstarGroups}
        />
      )

    if (selectedTab === 'sms')
      return (
        // The SMS channel starts disabled until the tab has been saved with it switched on.
        <EventsSmsTab
          key={selectedTenantId}
          onUnsavedChangesChange={setSmsHasUnsavedChanges}
          smsNotificationsEnabled={smsNotificationsEnabled}
          senderPhoneNumber={event.senderPhoneNumber ?? null}
          internationalSmsAllowed={internationalSmsFlag && internationalSmsEnabled === true}
          values={{
            active: event.smsSettings?.active ?? false,
            templateId: event.smsSettings?.templateId ?? null,
            to: event.smsSettings?.to ?? [],
          }}
          onSave={handleSaveSmsSettings}
          onDeactivate={handleDeactivateSms}
          isDisabled={!canEdit}
          isConfigured={event.smsSettings !== null}
        />
      )

    return <EventsThirdPartyTab />
  }

  return (
    <div className={`page events${selectedTab === 'sms' ? ' events--sms' : ''}`}>
      <PageHeading
        title={event?.name ?? 'Event'}
        breadcrumbs={[
          ...(selectedTab === 'sms' ? [] : [{ label: 'Home', to: '/dashboard' as const }]),
          { label: 'Event', to: '/events' },
          { label: event?.name ?? 'Event' },
        ]}
      />

      <EventsTabBar selected={selectedTab} onSelect={handleSelectTab} />

      <UnsavedChanges
        isBlocked={pendingTab !== null}
        onLeave={leavePendingTab}
        onStay={() => setPendingTab(null)}
        modalMessage={
          selectedTab === 'sms' ? UNSAVED_SMS_CHANGES_MESSAGE : UNSAVED_EMAIL_CHANGES_MESSAGE
        }
      />

      <section className="events__section">{renderTabContent()}</section>
    </div>
  )
}

export default EditEvent
