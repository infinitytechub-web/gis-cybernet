import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'GIS Cybernet'

interface TestEmailProps {
  sentBy?: string
  sentAt?: string
  note?: string
}

const TestEmail = ({ sentBy, sentAt, note }: TestEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{SITE_NAME} email infrastructure test</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{SITE_NAME} — Test Email</Heading>
        <Text style={text}>
          This is a test message confirming that email delivery from{' '}
          <strong>notify.gis-cybernet.com</strong> is operational.
        </Text>
        <Section style={card}>
          <Text style={meta}><strong>Sent by:</strong> {sentBy || 'Administrator'}</Text>
          <Text style={meta}><strong>Sent at:</strong> {sentAt || new Date().toISOString()}</Text>
          {note ? <Text style={meta}><strong>Note:</strong> {note}</Text> : null}
        </Section>
        <Text style={footer}>
          If you received this in error, you may safely ignore it.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TestEmail,
  subject: 'GIS Cybernet — Test Email',
  displayName: 'Test email',
  previewData: { sentBy: 'Administrator', sentAt: new Date().toISOString(), note: 'Sample preview' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0a3d2e', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px' }
const card = { backgroundColor: '#f4f7f5', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px 18px', margin: '12px 0 20px' }
const meta = { fontSize: '13px', color: '#374151', margin: '4px 0' }
const footer = { fontSize: '12px', color: '#9ca3af', margin: '24px 0 0' }
