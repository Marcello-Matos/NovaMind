import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NovaMind',
  description:
    'Assistentes inteligentes para pessoas e empresas — tarefas, memória controlável e conhecimento personalizado.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
