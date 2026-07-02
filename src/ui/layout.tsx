import { cssString } from './styles';

export type LayoutProps = {
  title?: string;
  theme?: 'dark' | 'light';
  children: any;
};

export const Layout = ({
  title = 'itsasecret',
  theme = 'dark',
  children,
}: LayoutProps) => (
  <html lang="en" data-theme={theme}>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <style dangerouslySetInnerHTML={{ __html: cssString }} />
    </head>
    <body>{children}</body>
  </html>
);
