'use client';
import { useRef } from 'react';

interface SmartDatePickerProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string; // Container className
    inputClassName?: string; // Internal input className
    disabled?: boolean;
    'data-testid'?: string;
}

export default function SmartDatePicker({
    value,
    onChange,
    placeholder = "0000-00-00",
    className = "",
    inputClassName = "",
    disabled = false,
    'data-testid': dataTestId
}: SmartDatePickerProps) {
    const dateInputRef = useRef<HTMLInputElement>(null);

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/[^0-9]/g, '');

        // Auto-hyphenation: YYYYMMDD -> YYYY-MM-DD
        if (val.length > 4 && val.length <= 6) {
            val = val.slice(0, 4) + '-' + val.slice(4);
        } else if (val.length > 6) {
            val = val.slice(0, 4) + '-' + val.slice(4, 6) + '-' + val.slice(6, 8);
        }

        onChange(val);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        // If current value is default placeholder string, clear it for easier typing
        if (value === "0000-00-00") {
            onChange("");
        }
    };

    const handleIconClick = () => {
        if (disabled) return;
        try {
            if (dateInputRef.current) {
                if ('showPicker' in HTMLInputElement.prototype) {
                    dateInputRef.current.showPicker();
                } else {
                    dateInputRef.current.click();
                }
            }
        } catch (e) {
            console.error("Failed to open picker:", e);
        }
    };

    return (
        <div className={`relative flex w-full items-center group ${className}`}>
            <input
                data-testid={dataTestId}
                type="text"
                value={value || ''}
                onChange={handleTextChange}
                onFocus={handleFocus}
                placeholder={placeholder}
                className={`w-full pr-10 outline-none transition-all ${inputClassName} ${disabled ? 'bg-transparent opacity-50' : ''}`}
                spellCheck={false}
                disabled={disabled}
                maxLength={10}
            />

            {/* Hidden native date picker */}
            <input
                type="date"
                ref={dateInputRef}
                value={value && value.length === 10 ? value : ''}
                onChange={(e) => onChange(e.target.value)}
                className="absolute w-0 h-0 opacity-0 pointer-events-none"
                tabIndex={-1}
                disabled={disabled}
            />

            {/* Calendar Icon */}
            <button
                type="button"
                onClick={handleIconClick}
                className="absolute inset-y-0 right-3 text-[var(--toss-gray-3)] hover:text-[var(--toss-blue)] transition-colors cursor-pointer flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed group-hover:text-[var(--toss-blue)]"
                tabIndex={-1}
                disabled={disabled}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
            </button>
        </div>
    );
}
