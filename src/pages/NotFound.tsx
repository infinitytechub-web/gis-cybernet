import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="text-center max-w-lg">
        {/* Decorative 404 illustration */}
        <motion.div
          className="relative mx-auto mb-8 w-72 h-56"
          initial={{ opacity: 0, scale: 0.85, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Browser window frame */}
          <div className="absolute inset-4 rounded-xl border-2 border-muted-foreground/10 bg-muted/60">
            {/* Window dots */}
            <div className="flex gap-1.5 p-3">
              <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
              <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
              <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
            </div>
            {/* Grid lines */}
            <div className="absolute inset-0 opacity-[0.06]">
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-foreground" />
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-foreground" />
              <div className="absolute top-1/3 left-0 right-0 h-px bg-foreground" />
              <div className="absolute top-2/3 left-0 right-0 h-px bg-foreground" />
            </div>
          </div>
          {/* Large 404 text */}
          <motion.div
            className="absolute top-8 right-8 text-7xl font-black text-muted-foreground/10 tracking-tight select-none"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            404
          </motion.div>
          {/* Decorative accent shapes */}
          <motion.div
            className="absolute left-6 top-1/2 -translate-y-1/2"
            initial={{ opacity: 0, rotate: -30 }}
            animate={{ opacity: 1, rotate: 0 }}
            transition={{ duration: 0.5, delay: 0.4, ease: "easeOut" }}
          >
            <svg width="60" height="80" viewBox="0 0 60 80" fill="none" className="text-primary">
              <path d="M50 10 C20 10, 5 30, 5 50 C5 65, 15 75, 30 75" stroke="currentColor" strokeWidth="10" strokeLinecap="round" fill="none" />
            </svg>
          </motion.div>
          <motion.div
            className="absolute right-6 bottom-16 w-8 h-3 rounded-sm bg-primary/80 rotate-[-8deg]"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          />
          {/* Diagonal accent */}
          <div className="absolute left-12 top-8 w-32 h-32 bg-primary/5 rotate-45 rounded-lg" />
        </motion.div>

        <motion.h1
          className="text-2xl font-bold text-foreground mb-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          This Page Does Not Exist
        </motion.h1>
        <motion.p
          className="text-muted-foreground mb-8 text-sm leading-relaxed"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.45 }}
        >
          Sorry, the page you are looking for could not be found. It's just an accident that was not intentional.
        </motion.p>

        <motion.div
          className="flex items-center justify-center gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.55 }}
        >
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Go Back
          </Button>
          <Button size="sm" asChild>
            <Link to="/login">
              <Home className="mr-1.5 h-4 w-4" />
              Return Home
            </Link>
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default NotFound;
