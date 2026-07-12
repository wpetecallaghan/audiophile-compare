import { Link } from '@/components/ui/Link'
import { getTranslations } from 'next-intl/server'
import { Heading } from '@/components/ui/Heading'
import { PageShell } from '@/components/ui/PageShell'
import { Section } from '@/components/ui/Section'
import { Text } from '@/components/ui/Text'

export default async function AboutPage() {
  const t = await getTranslations('about')

  return (
    <PageShell maxWidth="2xl">
      <Heading level={1}>{t('heading')}</Heading>

      <Section heading={t('whyHeading')}>
        <Text tone="body">{t('whyBody1')}</Text>
        <Text tone="body">{t('whyBody2')}</Text>
      </Section>

      <Section heading={t('tuneMethodHeading')}>
        <Text tone="body">{t('tuneMethodBody1')}</Text>
        <Text tone="body">{t('tuneMethodBody2')}</Text>
        <Text tone="body">{t('tuneMethodBody3')}</Text>
        <Text tone="body">{t('tuneMethodBody4')}</Text>
        <Link
          href="https://www.lejonklou.com/forum/viewtopic.php?p=78529#p78529"
          variant="inline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('tuneMethodSourceLink')}
        </Link>
      </Section>

      <Section heading={t('listenersHeading')}>
        <Text tone="body">{t('listenersBody1')}</Text>
        <Text tone="body">{t('listenersBody2')}</Text>
        <Text tone="body">{t('listenersBody3')}</Text>
      </Section>

      <Section heading={t('creatorsHeading')}>
        <Text tone="body">{t('creatorsBody1')}</Text>
        <Text tone="body">{t('creatorsBody2')}</Text>
        <Text tone="body">{t('creatorsBody3')}</Text>
      </Section>

      <Section heading={t('gettingStartedHeading')}>
        <Text tone="body">{t('gettingStartedBody')}</Text>
        <div className="flex items-center gap-4">
          <Link href="/register">
            {t('registerCta')}
          </Link>
          <Link href="/login">
            {t('signInCta')}
          </Link>
        </div>
      </Section>
    </PageShell>
  )
}
