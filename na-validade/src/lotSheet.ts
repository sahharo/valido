import { createContext, useContext } from 'react'

// Lets any screen open the lot details sheet (rendered once by LotSheetProvider).
export const LotSheetContext = createContext<(lotId: number, action?: 'withdraw' | 'promo') => void>(() => {})
export const useOpenLot = () => useContext(LotSheetContext)
