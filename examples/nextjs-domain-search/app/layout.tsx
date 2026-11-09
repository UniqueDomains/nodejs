import type { ReactNode } from 'react';

export const metadata = { title: 'Domain search' };

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>{children}</body>
        </html>
    );
}
