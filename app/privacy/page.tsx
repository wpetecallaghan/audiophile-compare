import { getTranslations } from 'next-intl/server'
import { Heading } from '@/components/ui/Heading'
import { PageShell } from '@/components/ui/PageShell'
import { Section } from '@/components/ui/Section'
import { Text } from '@/components/ui/Text'

export default async function PrivacyPage() {
  const t = await getTranslations('privacy')

  return (
    <PageShell maxWidth="2xl">
      <Heading level={1}>{t('heading')}</Heading>
      <Text tone="body">{t('intro')}</Text>

      <Section heading={t('collectHeading')}>
        <Text tone="body">{t('collectBody')}</Text>
      </Section>

      <Section heading={t('useHeading')}>
        <Text tone="body">{t('useBody')}</Text>
      </Section>

      <Section heading={t('thirdPartiesHeading')}>
        <Text tone="body">{t('thirdPartiesBody')}</Text>
      </Section>

      <Section heading={t('cookiesHeading')}>
        <Text tone="body">{t('cookiesBody')}</Text>
      </Section>

      <Section heading={t('rightsHeading')}>
        <Text tone="body">{t('rightsBody')}</Text>
      </Section>

      <Section heading={t('childrenHeading')}>
        <Text tone="body">{t('childrenBody')}</Text>
      </Section>

      <Section heading={t('contactHeading')}>
        <Text tone="body">{t('contactBody')}</Text>
      </Section>
    </PageShell>
  )
}
