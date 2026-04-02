'use client';
import React, { useRef } from 'react';

interface SmartMonthPickerProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    inputClassName?: string;
    disabled?: boolean;
    'data-testid'?: string;
}

const SmartMonthPicker: React.FC<SmartMonthPickerProps> = ({
    value,
    onChange,
    placeholder = "0000-00",
    className = "",
    inputClassName = "",
    disabled = false,
    'data-testid': dataTestId,
}) => {
    const dateInputRef = useRef<HTMLInputElement>(null);

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/[^0-9]/g, '');
        if (val.length > 4) {
            val = val.slice(0, 4) + '-' + val.slice(4, 6);
        }
        onChange(val);
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
    };

    const openPicker = () => {
        if (dateInputRef.current && !disabled) {
            dateInputRef.current.showPicker();
        }
    };

    return (
        <div className={`relative flex items-center ${className}`}>
            <input
                data-testid={dataTestId}
                type="text"
                value={value || ''}
                onChange={handleTextChange}
                placeholder={placeholder}
                className={`w-full h-full bg-transparent border-none outline-none pr-8 ${inputClassName}`}
                maxLength={7}
                disabled={disabled}
            />
            <button
                type="button"
                onClick={openPicker}
                className="absolute right-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] transition-colors flex items-center justify-center"
                tabIndex={-1}
                disabled={disabled}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
            </button>
            <input
                ref={dateInputRef}
                type="month"
                value={value || ''}
                onChange={handleDateChange}
                className="absolute opacity-0 pointer-events-none w-0 h-0"
                tabIndex={-1}
                disabled={disabled}
            />
        </div>
    );
};

export default SmartMonthPicker;
