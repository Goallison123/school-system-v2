import React from 'react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
  title?: string;
};

export default function IconButton({ children, className = '', ...rest }: Props) {
  return (
    <button className={`icon-button ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}
