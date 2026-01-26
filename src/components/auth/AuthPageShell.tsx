import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthPageShell(props: {
  title: string;
  description?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-white">
              <CheckCircle className="h-6 w-6" />
            </div>
            <span className="ml-2 text-2xl font-bold text-gray-900">SERP Lists</span>
          </Link>

          <p className="mt-2 text-sm text-gray-600">{props.footer}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{props.title}</CardTitle>
            {props.description ? <CardDescription>{props.description}</CardDescription> : null}
          </CardHeader>
          <CardContent className="space-y-6">{props.children}</CardContent>
        </Card>
      </div>
    </div>
  );
}

