'use client';

import React, { memo } from 'react';
import { Header } from '@/components/organisms/Header/Header';
import type { HeaderProps } from '@/components/organisms/Header/Header';

export type AppShellChromeProps = HeaderProps;

export const AppShellChrome = memo(function AppShellChrome(props: AppShellChromeProps) {
  return <Header {...props} />;
});

AppShellChrome.displayName = 'AppShellChrome';
