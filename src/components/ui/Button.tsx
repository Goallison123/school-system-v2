import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'text' | 'icon';
};

export default function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  const cls = variant === 'primary' ? 'primary-button' : variant === 'secondary' ? 'secondary-button' : variant === 'text' ? 'text-button' : 'icon-button';
  return (
    <button className={`${cls} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}
