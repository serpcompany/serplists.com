import React from "react";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, Home, FileText, CheckSquare, Settings, ExternalLink, Sparkles, Tag, Info, Mail } from "lucide-react";
interface LayoutProps {
  children: React.ReactNode;
}
export const Layout: React.FC<LayoutProps> = ({
  children
}) => {
  const {
    user,
    logout
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const loggedInNavigation = [{
    name: "Templates",
    href: "/templates",
    icon: FileText
  }, {
    name: "Runs",
    href: "/dashboard",
    icon: CheckSquare
  }];
  const handleLogout = () => {
    logout();
    navigate("/");
  };
  const navigation = [{
    name: "Features",
    href: "/features",
    icon: Sparkles
  }, {
    name: "Pricing",
    href: "/pricing",
    icon: Tag
  }, {
    name: "Checklists",
    href: "/checklists",
    icon: CheckSquare
  }, {
    name: "About",
    href: "/about",
    icon: Info
  }, {
    name: "Contact",
    href: "/contact",
    icon: Mail
  }];
  const isActive = (href: string) => location.pathname === href;
  return <div className="min-h-screen bg-background flex flex-col">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo/Brand */}
            <div className="flex items-center">
              <Link to="/dashboard" className="flex items-center gap-2">
                
                <span className="text-xl font-bold">SERP Lists</span>
              </Link>
            </div>

            {/* Navigation Links */}
            <nav className="hidden md:flex items-center space-x-1">
              {navigation.map((item: { icon: unknown; name: unknown; href: unknown }) => {
              const Icon = item.icon;
              return <Link key={item.name} to={item.href} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive(item.href) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                    
                    {item.name}
                  </Link>;
            })}
            </nav>

            {/* User Menu */}
            <div className="flex items-center gap-4">
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="p-0 h-auto hover:bg-transparent">
                      <Avatar className="h-8 w-8 cursor-pointer transition-opacity hover:opacity-80">
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                          {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-background border shadow-lg" sideOffset={8}>
                    <div className="px-3 py-2 border-b">
                      <p className="text-sm font-medium">{user?.name}</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                    
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard" className="w-full flex items-center gap-2 cursor-pointer">
                        <Home className="h-4 w-4" />
                        Dashboard
                      </Link>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem asChild>
                      <Link to="/templates" className="w-full flex items-center gap-2 cursor-pointer">
                        <FileText className="h-4 w-4" />
                        My Templates
                      </Link>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem asChild>
                      <Link to="/account" className="w-full flex items-center gap-2 cursor-pointer">
                        <Settings className="h-4 w-4" />
                        Account Settings
                      </Link>
                    </DropdownMenuItem>
                    
                    {user?.username && <DropdownMenuItem asChild>
                         <Link to={`/profile/${user.username}`} target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-2 cursor-pointer">
                          <ExternalLink className="h-4 w-4" />
                          Public Profile
                        </Link>
                      </DropdownMenuItem>}
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50">
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button asChild variant="outline">
                  <Link to="/login">Sign In</Link>
                </Button>
              )}
            </div>
          </div>
        </div>

        {user ? <div className="border-t bg-muted/40">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <nav className="flex h-10 items-center gap-1 overflow-x-auto">
                {loggedInNavigation.map((item: {
            icon: unknown;
            name: unknown;
            href: unknown;
          }) => {
                  const Icon = item.icon;
                  return <Link key={item.name} to={item.href} className={`inline-flex items-center gap-1 whitespace-nowrap px-2 py-1 rounded-md text-xs font-medium transition-colors ${isActive(item.href) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                      
                      <Icon className="h-3 w-3" />
                      {item.name}
                    </Link>;
                })}
              </nav>
            </div>
          </div> : null}

        {/* Mobile Navigation */}
        <div className="md:hidden border-t px-4 py-2">
          <nav className="flex space-x-1">
            {navigation.map((item: { icon: unknown; name: unknown; href: unknown }) => {
            const Icon = item.icon;
            return <Link key={item.name} to={item.href} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive(item.href) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                  <Icon className="h-4 w-4" />
                  {item.name}
                </Link>;
          })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              
              <span>© SERP</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link to="/features" className="hover:text-foreground transition-colors">
                Features
              </Link>
              <Link to="/pricing" className="hover:text-foreground transition-colors">
                Pricing
              </Link>
              <Link to="/checklists" className="hover:text-foreground transition-colors">
                Checklist Library
              </Link>
              <Link to="/about" className="hover:text-foreground transition-colors">
                About
              </Link>
              <Link to="/contact" className="hover:text-foreground transition-colors">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>;
};
