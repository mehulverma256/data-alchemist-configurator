import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Data Alchemist - AI Resource Allocation Configurator",
  description: "Transform messy spreadsheets into clean, validated data with intelligent business rules and priority configuration.",
  keywords: ["AI", "resource allocation", "spreadsheet", "data validation", "business rules"],
  authors: [{ name: "Mehul Verma" }],
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body
        className="antialiased min-h-screen bg-white text-gray-900 font-sans"
        suppressHydrationWarning={true}
      >
        <div className="min-h-screen flex flex-col">
          <header className="border-b bg-white/50 backdrop-blur-sm sticky top-0 z-50">
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">DA</span>
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">Data Alchemist</h1>
                    <p className="text-xs text-gray-500">AI Resource Allocation Configurator</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span>Ready</span>
                  </div>
                </div>
              </div>
            </div>
          </header>
          
          <main className="flex-1 container mx-auto px-4 py-8">
            {children}
          </main>
          
          <footer className="border-t bg-gray-50/50 py-6">
            <div className="container mx-auto px-4 text-center text-sm text-gray-600">
              <p>Built with Next.js, TypeScript, and OpenAI • {new Date().getFullYear()}</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}