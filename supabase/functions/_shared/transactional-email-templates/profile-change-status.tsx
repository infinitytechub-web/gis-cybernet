import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GIS Cybernet'

interface ProfileChangeStatusProps {
  recipientName?: string
  status?: 'approved' | 'rejected' | 'pending'
  fields?: string[]
  reviewerName?: string
  reviewerNotes?: string
  reviewedAt?: string
}

const labelFor = (s?: string) => {
  if (s === 'approved') return 'Approved'
  if (s === 'rejected') return 'Rejected'
  return 'Marked Pending'
}

const accentFor = (s?: string) => {
  if (s === 'approved') return '#15803d'
  if (s === 'rejected') return '#b91c1c'
  return '#b45309'
}

const ProfileChangeStatusEmail = ({
  recipientName,
  status,
  fields = [],
  reviewerName,
  reviewerNotes,
  reviewedAt,
}: ProfileChangeStatusProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your profile change request has been {labelFor(status).toLowerCase()}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{SITE_NAME}</Heading>
        <Text style={text}>
          {recipientName ? `Dear ${recipientName},` : 'Dear Staff,'}
        </Text>
        <Text style={text}>
          Your profile change request has been reviewed and the outcome is below.
        </Text>

        <Section style={{ ...badgeWrap, borderColor: accentFor(status) }}>
          <Text style={{ ...badge, color: accentFor(status) }}>{labelFor(status)}</Text>
        </Section>

        {fields.length > 0 && (
          <Text style={text}>
            <strong>Fields requested:</strong> {fields.join(', ')}
          </Text>
        )}
        {reviewerName && (
          <Text style={text}>
            <strong>Reviewed by:</strong> {reviewerName}
          </Text>
        )}
        {reviewedAt && (
          <Text style={text}>
            <strong>Reviewed at:</strong> {reviewedAt}
          </Text>
        )}
        {reviewerNotes && (
          <Section style={notesBox}>
            <Text style={notesLabel}>Reviewer notes</Text>
            <Text style={notesText}>{reviewerNotes}</Text>
          </Section>
        )}

        <Text style={footer}>
          This is an automated message from {SITE_NAME}. Please log in to view the latest state of your profile.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ProfileChangeStatusEmail,
  subject: (data: Record<string, any>) =>
    `Profile change request ${labelFor(data?.status).toLowerCase()}`,
  displayName: 'Profile Change — Review Outcome',
  previewData: {
    recipientName: 'Kwame Mensah',
    status: 'approved',
    fields: ['phone', 'email'],
    reviewerName: 'OIC Adjei',
    reviewerNotes: 'Verified against Ghana Card.',
    reviewedAt: '10 May 2026 14:32',
  },
} satisfies TemplateEntry

const main: React.CSSProperties = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container: React.CSSProperties = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1: React.CSSProperties = { fontSize: '20px', fontWeight: 'bold', color: '#0f5132', margin: '0 0 16px' }
const text: React.CSSProperties = { fontSize: '14px', color: '#1f2937', lineHeight: 1.5, margin: '0 0 12px' }
const badgeWrap: React.CSSProperties = {
  border: '1px solid', borderRadius: '6px', padding: '12px 16px', margin: '16px 0', textAlign: 'center',
}
const badge: React.CSSProperties = { fontSize: '16px', fontWeight: 'bold', margin: 0, letterSpacing: '0.04em' }
const notesBox: React.CSSProperties = {
  backgroundColor: '#f9fafb', borderLeft: '3px solid #0f5132', padding: '12px 14px', margin: '12px 0',
}
const notesLabel: React.CSSProperties = { fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', margin: '0 0 4px' }
const notesText: React.CSSProperties = { fontSize: '14px', color: '#1f2937', margin: 0, whiteSpace: 'pre-wrap' }
const footer: React.CSSProperties = { fontSize: '12px', color: '#6b7280', margin: '24px 0 0' }
