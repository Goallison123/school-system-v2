import React from 'react';

type Props = {
  initials?: string;
  variant?: 'user' | 'mini' | 'brand' | 'contact' | 'large';
  children?: React.ReactNode;
  className?: string;
};

export default function Avatar({ initials, variant = 'user', children, className = '' }: Props) {
  const map: Record<string, string> = {
    user: 'user-avatar',
    mini: 'mini-avatar',
    brand: 'brand-mark',
    contact: 'contact-avatar',
    large: 'large-avatar',
  };
  const cls = `${map[variant] ?? 'user-avatar'} ${className}`.trim();
  return (
    <div className={cls}>
      {children ?? initials ?? ''}
    </div>
  );
}
