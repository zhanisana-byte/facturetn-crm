// REMPLACE TOUT LE CONTENU DE TON FICHIER SIDEBAR PAR CE CODE :
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo, useMemo } from 'react';

// 1. Importe ton hook Supabase actuel ou utilise celui-ci :
// Si tu as un hook personnalisé, utilise-le ici :
// import { useSupabase } from '@/lib/supabase/client';
// Sinon, utilise celui du Provider :
import { useSupabase } from '@/app/providers/SupabaseProvider';

const MenuItem = memo(({ href, icon, label, isActive }: any) => (
  <Link
    href={href}
    className={`flex items-center p-3 rounded-lg transition-colors ${
      isActive 
        ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-500' 
        : 'hover:bg-gray-50 text-gray-700 hover:text-gray-900'
    }`}
    prefetch={true}
  >
    <span className="mr-3 text-lg">{icon}</span>
    <span className="font-medium">{label}</span>
  </Link>
));
MenuItem.displayName = 'MenuItem';

const MenuItemsList = memo(({ items, pathname }: any) => (
  <nav className="space-y-1">
    {items.map((item: any) => (
      <MenuItem
        key={item.href}
        href={item.href}
        icon={item.icon}
        label={item.label}
        isActive={pathname === item.href || pathname.startsWith(item.href + '/')}
      />
    ))}
  </nav>
));
MenuItemsList.displayName = 'MenuItemsList';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, isLoading } = useSupabase(); // ✅ Plus d'appels répétés

  // CALCUL DU MENU UNE SEULE FOIS
  const menuItems = useMemo(() => {
    if (isLoading || !user) return [];

    const baseItems = [
      { href: '/dashboard', icon: '🏠', label: 'Tableau de bord' },
      { href: '/dashboard/invoices', icon: '🧾', label: 'Factures' },
      { href: '/dashboard/clients', icon: '👥', label: 'Clients' },
    ];

    // ADAPTE CES LIENS À TON PROJET :
    switch (user.user_type) {
      case 'societe':
        return [...baseItems, 
          { href: '/dashboard/societe', icon: '🏢', label: 'Ma Société' }
        ];
      case 'cabinet':
        return [...baseItems, 
          { href: '/dashboard/cabinet', icon: '⚖️', label: 'Mon Cabinet' },
          { href: '/dashboard/societes', icon: '🏢', label: 'Sociétés Gérées' }
        ];
      case 'groupe':
        return [...baseItems,
          { href: '/dashboard/groupe', icon: '🏛️', label: 'Mon Groupe' },
          { href: '/dashboard/filiales', icon: '🏢', label: 'Filiales' }
        ];
      default:
        return baseItems;
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="w-64 bg-white border-r border-gray-200 p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white border-r border-gray-200 p-4 sticky top-0 h-screen overflow-y-auto">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-gray-800">FactureTN</h1>
        {user && (
          <p className="text-sm text-gray-500 mt-1">
            {user.user_type === 'societe' && 'Société'}
            {user.user_type === 'cabinet' && 'Cabinet'}
            {user.user_type === 'groupe' && 'Groupe'}
          </p>
        )}
      </div>
      
      <MenuItemsList items={menuItems} pathname={pathname} />
      
      <div className="mt-8 pt-4 border-t border-gray-200">
        <MenuItem
          href="/dashboard/settings"
          icon="⚙️"
          label="Paramètres"
          isActive={pathname === '/dashboard/settings'}
        />
        <MenuItem
          href="/logout"
          icon="🚪"
          label="Déconnexion"
          isActive={false}
        />
      </div>
    </div>
  );
}
