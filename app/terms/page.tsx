import { getTranslations } from 'next-intl/server'
import { Heading } from '@/components/ui/Heading'
import { PageShell } from '@/components/ui/PageShell'
import { Section } from '@/components/ui/Section'
import { Text } from '@/components/ui/Text'

export default async function TermsPage() {
  const t = await getTranslations('terms')

  return (
    <PageShell maxWidth="2xl">
      <Heading level={1}>{t('heading')}</Heading>
      <Text tone="body">{t('intro')}</Text>

      <Section heading={t('serviceHeading')}>
        <Text tone="body">{t('serviceBody')}</Text>
      </Section>

      <Section heading={t('accountHeading')}>
        <Text tone="body">{t('accountBody')}</Text>
      </Section>

      <Section heading={t('contentHeading')}>
        <Text tone="body">{t('contentBody')}</Text>
      </Section>

      <Section heading={t('acceptableUseHeading')}>
        <Text tone="body">{t('acceptableUseBody')}</Text>
      </Section>

      <Section heading={t('warrantyHeading')}>
        <Text tone="body">{t('warrantyBody')}</Text>
      </Section>

      <Section heading={t('liabilityHeading')}>
        <Text tone="body">{t('liabilityBody')}</Text>
      </Section>

      <Section heading={t('endingHeading')}>
        <Text tone="body">{t('endingBody')}</Text>
      </Section>

      <Section heading={t('changesHeading')}>
        <Text tone="body">{t('changesBody')}</Text>
      </Section>

      <Section heading={t('contactHeading')}>
        <Text tone="body">{t('contactBody')}</Text>
      </Section>
    </PageShell>
  )
}
