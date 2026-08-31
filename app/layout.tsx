import "./globals.css";

export const metadata = {
  title: "Arsip",
  description: "Arsip dokumen perusahaan",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
