import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, MessageCircle } from "lucide-react";

const Contact = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold md:text-5xl">Contact</h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Questions, feedback, or support requests? Reach out and we will respond as soon as possible.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border bg-card">
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Mail className="h-6 w-6" />
              </div>
              <CardTitle>Email support</CardTitle>
              <CardDescription>Send details about your issue, plus the account email if relevant.</CardDescription>
              <div className="pt-4">
                <Button asChild>
                  <a href="mailto:support@serplists.com">support@serplists.com</a>
                </Button>
              </div>
            </CardHeader>
          </Card>

          <Card className="border bg-card">
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MessageCircle className="h-6 w-6" />
              </div>
              <CardTitle>Product feedback</CardTitle>
              <CardDescription>Tell us what would make SERP Lists more useful for your workflow.</CardDescription>
              <div className="pt-4">
                <Button asChild variant="outline">
                  <a href="mailto:support@serplists.com?subject=SERP%20Lists%20feedback">Share feedback</a>
                </Button>
              </div>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Contact;
