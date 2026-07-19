import React from 'react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold font-mono text-primary">404</h1>
        <h2 className="text-2xl font-medium tracking-tight">Sector Not Found</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          The coordinates you entered do not match any known sector in the BlackMap.
        </p>
        <div className="pt-6">
          <Link href="/" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-md font-medium hover:bg-primary/90 transition-colors">
            Return to Base
          </Link>
        </div>
      </div>
    </div>
  );
}
