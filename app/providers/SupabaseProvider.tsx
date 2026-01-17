// app/providers/SupabaseProvider.tsx
'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';

type UserWithType = User & {
  user_type?: 'societe' | 'cabinet' | 'groupe';
  companies?: any[];
};

interface SupabaseContextType {
  supabase: ReturnType<typeof createClientComponentClient>;
  session: Session | null;
  user: UserWithType | null;
  isLoading: boolean;
}

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClientComponentClient());
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<UserWithType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const loadSession = async () => {
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        
        if (session?.user) {
          // MODIFIE ICI : Remplace 'profiles' par ta table réelle
          const { data: profile } = await supabase
            .from('profiles') // ⬅️ Change si ta table s'appelle autrement
            .select('user_type')
            .eq('id', session.user.id)
            .single();
          
          let companies = [];
          if (profile?.user_type) {
            const { data: userCompanies } = await supabase
              .from('companies') // ⬅️ Change si ta table s'appelle autrement
              .select('*')
              .eq('user_id', session.user.id);
            companies = userCompanies || [];
          }
          
          setUser({
            ...session.user,
            user_type: profile?.user_type,
            companies
          });
        }
      } catch (error) {
        console.error('Error loading session:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      router.refresh();
    });

    return () => subscription.unsubscribe();
  }, [supabase, router]);

  return (
    <SupabaseContext.Provider value={{ supabase, session, user, isLoading }}>
      {children}
    </SupabaseContext.Provider>
  );
}

export const useSupabase = () => {
  const context = useContext(SupabaseContext);
  if (!context) throw new Error('useSupabase must be used within SupabaseProvider');
  return context;
};
