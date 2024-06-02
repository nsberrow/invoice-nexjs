import testOrder from '../service/test-example.json'
import type { InferGetServerSidePropsType, GetServerSideProps } from 'next'
import { parseBody } from "next/dist/server/api-utils/node/parse-body.js"

import * as Sentry from "@sentry/nextjs";

import { Inter } from 'next/font/google'

import * as bitgener from 'bitgener'

import * as R from 'ramda'

const inter = Inter({ subsets: ['latin'] })

export interface Order {
    OrderNumber: string;
    LFSOrderNumber: string;
    ProviderInvoiceNumber: string;
    OrderDespatchedDate: string;
    OrderPlacedDate: string;
    InvoiceNumber: string;
    CurrencySymbol: string;
    IsBeGC: boolean;
    Source: string;
    DeliverySummary: DeliverySummary[];
    PaymentDetails: PaymentDetails;
}

export interface DeliverySummary {
    OrderItems: OrderItem[];
    DeliveryDetails: DeliveryDetails;
}

export interface DeliveryDetails {
    Address: Address;
    ContactCellphone: string;
}

export interface Address {
    AddressTypeId: number;
    AddressLine1: string;
    AddressLine2: string;
    Suburb: string;
    PostCode: string;
    Country: string;
}

export interface OrderItem {
    POS_TransactionNumber: string;
    OrderItemDate: string;
    ProductBrandFormatCode: string;
    ProductBrand: string;
    ProductDescription: string;
    SerialNumbers: any[];
    QuantityOrdered: number;
    ProductASP: number;
    DiscountsApplied: number;
    LineSubtotal: number;
    SKU_Number: string;
    SKU_Barcode: string;
}

export interface PaymentDetails {
    VoucherDiscountAmount: number;
    CharityAmount: number;
    TotalShippingAmount: number;
    TotalShippingDiscountAmount: number;
    Subtotal_AllLineItems: number;
    TotalBeforeTaxAmount: number;
    TaxAmount: number;
    TotalAfterTaxAmount: number;
    PaymentInformation: PaymentInformation[];
}

export interface PaymentInformation {
    PaymentType: string;
    PaymentValue: number;
}

const generateBarcode = async (barcodeString: string) => {
    return await bitgener({
        data: barcodeString,
        type: 'code128',
        output: 'string',
        encoding: 'ascii',
        crc: true,
        padding: 0,
        barWidth: 1.5,
        barHeight: 50,
        original1DSize: true,
        addQuietZone: false,
        color: '#000',
        opacity: 1,
        bgColor: '#FFF',
        bgOpacity: 0.1,
        hri: {
            show: true,
            fontFamily: 'Futura',
            fontSize: 10,
            marginTop: 9,
        },
    })
}

const ZAR = (z: any) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'ZAR',
    // These options are needed to round to whole numbers if that's what you want.
    minimumFractionDigits: 2, // (this suffices for whole numbers, but will print 2500.10 as $2,500.1)
    maximumFractionDigits: 2, // (causes 2500.99 to be printed as $2,501)
}).format(z).replace('ZAR', 'R')

export const getServerSideProps = (async ({ req }) => {
    let jsonOrder = testOrder as Order;
    if (req.method == 'POST') {
        console.log(`Invoice posted to the Service`)
        let body = await parseBody(req, '10mb') as Order
        jsonOrder = body;
    }
    if (process.env?.VERCEL && process.env.VERCEL && req.method == 'GET') {
        throw new Error("Cannot render this page.")
    }
    Sentry.setContext("postedBody", jsonOrder);
    let allOrderItems = new Array<OrderItem>()
    jsonOrder.DeliverySummary.forEach(deliverySum => {
        allOrderItems = [...allOrderItems, ...deliverySum.OrderItems]
    })
    const orderItems = await Promise.all(allOrderItems.map(async (i) => {
        const barcodeItem = await generateBarcode(i.SKU_Number)
        return {
            ...i,
            barcode: barcodeItem
        }
    }))
    const groupByDeliveries = R.groupBy(function (orderItem: OrderItem) {
        return `${orderItem.ProductBrand}|${orderItem.POS_TransactionNumber}`
    })
    const deliveryGrouping = groupByDeliveries(orderItems)
    const brandPosGrouping = await Promise.all(Object.keys(deliveryGrouping).map(async (groupData, groupIndex) => {
        const splitData = groupData.split("|")

        return {
            brand: splitData[0],
            posTransactionNumber: splitData[1],
            barcode: await generateBarcode(splitData[1]),
            formatCode: deliveryGrouping[groupData][0]['ProductBrandFormatCode'],
            items: deliveryGrouping[groupData] as OrderItem[],
            isFirst: groupIndex == 0,
        }
    }))
    return { props: { orderData: jsonOrder, brandGrouping: brandPosGrouping } }
}) satisfies GetServerSideProps<{
    orderData: Order,
    brandGrouping: any;
}>

interface OrderSectionParams {
    deliverySummaries: DeliverySummary[],
    currencySymbol: string,
    isBeGC: boolean,
    paymentDetails: PaymentDetails
}

function PaymentSection(orderData: Order) {
    const formatAmount = (amount: any) => ZAR(amount);

    return (
        <>
            <tr style={{ backgroundColor: "#e5e5e5" }}>
                <td height="20" colSpan={3} style={{ borderBottom: '1px solid #cccccc' }}></td>
            </tr>
            {orderData.PaymentDetails.PaymentInformation.length > 0 && (
                <>
                    <tr>
                        <td height="15"></td>
                    </tr>
                    <tr>
                        <td width="10"></td>
                        <td className={inter.className} style={{ fontSize: '13px', color: '#999999' }}>
                            <div className={inter.className} style={{ color: '#666666' }}>You paid using your:</div>
                            <table border={0} cellPadding="0" cellSpacing="0" width="99%">
                                <tbody>
                                    <tr>
                                        <td height="15" colSpan={2}></td>
                                    </tr>
                                    {orderData.PaymentDetails.PaymentInformation.map((paymentInformation, index) => (
                                        <tr key={index}>
                                            <td className={inter.className} width="55%" style={{ fontSize: '13px', color: '#999999' }}>
                                                <div className={inter.className} style={{ fontWeight: 500, color: '#666666' }}>
                                                    {paymentInformation.PaymentType}
                                                </div>
                                            </td>
                                            <td className={inter.className} width="45%" align="right" style={{ fontSize: '13px', color: '#999999' }}>
                                                <div className={inter.className}>
                                                    {formatAmount(paymentInformation.PaymentValue)}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </td>
                        <td width="10"></td>
                    </tr>
                </>
            )}
            <tr>
                <td height="20" colSpan={3}></td>
            </tr>
        </>
    );
}

function SubtotalSection(orderData: Order) {
    const formatAmount = (amount: any) => ZAR(amount);

    return (
        <table border={0} cellPadding="0" cellSpacing="0" width="100%">
            <tbody>
                <tr>
                    <td width="60%" className={inter.className} style={{ fontSize: '13px', color: '#999999' }}>
                        <div className={inter.className} style={{ fontWeight: 700, color: '#666666', paddingBottom: "7.5px" }}>Subtotal:</div>
                        {orderData.PaymentDetails.TotalShippingAmount > 0 && <div style={{ paddingBottom: "5px" }}>Delivery:</div>}
                        {orderData.PaymentDetails.TotalShippingDiscountAmount > 0 && <div style={{ paddingBottom: "5px" }}>Delivery Discount:</div>}
                        {orderData.PaymentDetails.VoucherDiscountAmount > 0 && (
                            <div style={{ paddingBottom: "5px" }}>{orderData.IsBeGC ? 'Discount:' : 'Vouchers:'}</div>
                        )}
                        {orderData.PaymentDetails.CharityAmount > 0 && <div>Charity Donation:</div>}
                    </td>
                    <td width="40%" align="right" className={inter.className} style={{ fontSize: '13px', color: '#999999' }}>
                        {orderData.PaymentDetails.CharityAmount > 0 ? (
                            <div style={{ fontWeight: 700, color: '#666666', paddingBottom: "5px" }}>
                                {formatAmount(orderData.PaymentDetails.Subtotal_AllLineItems - orderData.PaymentDetails.CharityAmount)}
                            </div>
                        ) : (
                            <div style={{ fontWeight: 700, color: '#666666', paddingBottom: "5px" }}>
                                {formatAmount(orderData.PaymentDetails.Subtotal_AllLineItems)}
                            </div>
                        )}
                        {orderData.PaymentDetails.TotalShippingAmount > 0 && (
                            <div style={{ paddingBottom: "5px" }}>{formatAmount(orderData.PaymentDetails.TotalShippingAmount)}</div>
                        )}
                        {orderData.PaymentDetails.TotalShippingDiscountAmount > 0 && (
                            <div style={{ paddingBottom: "5px" }}>{formatAmount(orderData.PaymentDetails.TotalShippingDiscountAmount)}</div>
                        )}
                        {orderData.PaymentDetails.VoucherDiscountAmount > 0 && (
                            <div style={{ paddingBottom: "5px" }}>{formatAmount(orderData.PaymentDetails.VoucherDiscountAmount)}</div>
                        )}
                        {orderData.PaymentDetails.CharityAmount > 0 && (
                            <div style={{ paddingBottom: "5px" }}>{formatAmount(orderData.PaymentDetails.CharityAmount)}</div>
                        )}
                    </td>
                </tr>
            </tbody>
        </table>
    );
}

function getImageUrl(formatCode: string) {
    if (['100', '101', '102', '105', '106', '107', '109', '110', '112', '113', '117', '118', '119', '122',
        '126', '128', '129', '130', '131', '132', '133', '138', '144', '146', '148', '150'].includes(formatCode)) {
        return `https://cdn.tfgmedia.co.za/Communication/BrandFormat/Bash/${formatCode}/${formatCode}_logo.png`
    } else {
        return `https://cdn.tfgmedia.co.za/Communication/BrandFormat/${formatCode}/${formatCode}_logo.png`
    }
}


function OrderSection({ brandGrouping, currencySymbol, isBeGC, paymentDetails }: OrderSectionParams) {
    // We need to basically do a GroupBy here and return them according to Brand-POS Transaction Number

    return (

        <>
            {brandGrouping.map((brandGroupData) => (
                <>
                    <tr>
                        <td height={'40'}></td>
                    </tr>
                    <tr>
                        <td>
                            <table style={{ width: '100%', borderSpacing: 0, borderCollapse: 'collapse' }}>
                                <tbody>
                                    <tr>
                                        <td width="50%">
                                            <img
                                                src={getImageUrl(brandGroupData.formatCode)}
                                                alt=""
                                                width="115"
                                            />
                                        </td>
                                        <td width="50%" style={{ textAlign: 'right' }}>
                                            <span dangerouslySetInnerHTML={{ __html: brandGroupData.barcode.svg }}>

                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td height="20"></td>
                    </tr>
                    <tr>
                        <td>
                            <table border={0} cellPadding="0" cellSpacing="0" width="100%" style={{ border: '1px solid #cccccc' }}>
                                <tbody>
                                    <tr className={inter.className} style={{ backgroundColor: '#000000', fontSize: '13px', color: '#FFFFFF', textTransform: 'uppercase', fontWeight: 500, borderBottom: '1px solid #cccccc' }}>
                                        <td width="100" style={{ padding: '20px 15px', borderRight: '1px solid #cccccc', borderBottom: '1px solid #cccccc' }}>SKU</td>
                                        <td width="270" style={{ padding: '20px 15px', borderRight: '1px solid #cccccc', borderBottom: '1px solid #cccccc' }}>Description</td>
                                        <td width="80" align="center" style={{ padding: '20px 15px', borderRight: '1px solid #cccccc', borderBottom: '1px solid #cccccc' }}>Qty</td>
                                        <td width="120" style={{ padding: '20px 15px', borderRight: '1px solid #cccccc', borderBottom: '1px solid #cccccc' }}>Total Price</td>
                                        <td width="120" style={{ padding: '20px 15px', borderRight: '1px solid #cccccc', borderBottom: '1px solid #cccccc' }}>Total Discount</td>
                                        <td width="120" style={{ padding: '20px 15px', borderBottom: '1px solid #cccccc' }}>Total</td>
                                    </tr>
                                    {brandGroupData.items.map(product => (
                                        <tr className={inter.className} key={product.SKU_Number} style={{ fontSize: '13px', color: '#333333', borderBottom: '1px solid #cccccc' }}>
                                            <td style={{ padding: '20px 15px', borderRight: '1px solid #cccccc', borderBottom: '1px solid #cccccc', width: "150px" }}>
                                                <div style={{ alignContent: 'center' }} dangerouslySetInnerHTML={{ __html: product.barcode.svg }}>

                                                </div>
                                            </td>
                                            <td style={{ padding: '20px 15px', borderRight: '1px solid #cccccc', borderBottom: '1px solid #cccccc', fontWeight: 500 }}>
                                                {product.ProductDescription} <br />
                                                <span style={{ fontSize: '11px', fontWeight: 'normal' }}>
                                                    {product.SerialNumbers && product.SerialNumbers.length > 0 &&
                                                        product.SerialNumbers.map(serialNumber => (
                                                            <>
                                                                {serialNumber.SerialNumberDescription && `${serialNumber.SerialNumberDescription}: `}
                                                                {serialNumber.SerialNumber && `${serialNumber.SerialNumber}. `}
                                                            </>
                                                        ))
                                                    }
                                                </span>
                                            </td>
                                            <td align="center" style={{ padding: '20px 15px', borderRight: '1px solid #cccccc', borderBottom: '1px solid #cccccc', color: '#999999' }}>
                                                {product.QuantityOrdered}
                                            </td>

                                            <td align="center" style={{ padding: '20px 15px', borderRight: '1px solid #cccccc', borderBottom: '1px solid #cccccc', color: '#999999' }}>
                                                {ZAR(product.ProductASP)}
                                            </td>

                                            <td align="center" style={{ padding: '20px 15px', borderRight: '1px solid #cccccc', borderBottom: '1px solid #cccccc', color: '#999999' }}>
                                                {isBeGC ?
                                                    <div>{ZAR(paymentDetails.VoucherDiscountAmount)}</div> :
                                                    `${ZAR(product.DiscountsApplied)}`
                                                }
                                            </td>

                                            <td align="center" style={{ padding: '20px 15px', borderBottom: '1px solid #cccccc', color: '#999999' }}>
                                                {ZAR(product.LineSubtotal)}
                                            </td>
                                        </tr>
                                    ))
                                    }
                                </tbody>
                            </table>
                        </td>
                    </tr>
                </>
            ))}
        </>
    );
}

export default function Page({
    orderData,
    brandGrouping,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {

    return (
        <table className={inter.className} style={{ margin: 'auto', border: 0, padding: 0, width: 710 }}>
            <tbody>
                <tr>
                    <td>
                        <div className={inter.className} style={{ width: '100%', textAlign: 'center' }}>
                            <h2>TAX INVOICE</h2>
                        </div>
                        <table style={{ border: 0, padding: 0, width: '100%' }}>
                            <tbody>
                                <tr style={{ verticalAlign: 'top', textAlign: 'left' }}>
                                    <td>
                                        <img
                                            src="https://cdn.tfgmedia.co.za/bash-assets/bash_black.png"
                                            alt=""
                                            height="60"
                                        />
                                    </td>
                                </tr>
                                <tr style={{ height: 20 }}><td></td></tr>
                                <tr>
                                    <td className={inter.className}
                                        style={{
                                            width: 312.5,
                                            verticalAlign: 'top',
                                            fontSize: 13,
                                            fontWeight: 200,
                                            color: '#666666',
                                        }}
                                    >
                                        <div style={{ marginBottom: 1 }}>Foschini Retail Group (Pty) Ltd</div>
                                        <div style={{ marginBottom: 1 }}>Stanley Lewis Centre</div>
                                        <div style={{ marginBottom: 1 }}>340 Voortrekker Road</div>
                                        <div style={{ marginBottom: 1 }}>Parow East 7500</div>
                                        <div style={{ marginBottom: 1 }}>Reg No 1988/007302/07</div>
                                        <div>VAT No 4210187250</div>
                                        <div>NCR No NCRCP36</div>
                                    </td>
                                    <td className={inter.className}
                                        style={{
                                            width: '312.5px',
                                            verticalAlign: 'top',
                                            textAlign: 'right',
                                            fontSize: '13px',
                                            color: '#666666',
                                        }}
                                    >
                                        <div className={inter.className} style={{ color: '#333333', fontWeight: 500, textTransform: 'uppercase', marginBottom: '20px' }}>
                                            Invoice {orderData.DeliverySummary[0].OrderItems[0].POS_TransactionNumber}
                                        </div>
                                        <div style={{
                                            float: "right"
                                        }}>
                                            <table
                                                className={inter.className}
                                                style={{
                                                    backgroundColor: '#e5e5e5',
                                                    border: '1px solid #cccccc',
                                                    padding: 0,
                                                    width: '300px',
                                                    margin: 0
                                                }}
                                            >
                                                <tbody>
                                                    <tr>
                                                        <td height="20" colSpan={4}></td>
                                                    </tr>
                                                    <tr>
                                                        <td style={{ width: '20px' }}></td>
                                                        <td className={inter.className} style={{ fontSize: '13px', fontWeight: 300, color: '#666666', lineHeight: '18px' }}>
                                                            {orderData.OrderNumber && (
                                                                <>
                                                                    <div>Order Number:</div><br />
                                                                </>
                                                            )}
                                                            {orderData.LFSOrderNumber && (
                                                                <>
                                                                    <div>Furniture Order Number:</div><br />
                                                                </>
                                                            )}
                                                            {orderData.ProviderInvoiceNumber && (
                                                                <>
                                                                    <div>Provider Invoice Number:</div><br />
                                                                </>
                                                            )}
                                                            <div>Placed:</div><br />
                                                            {!orderData.LFSOrderNumber && (
                                                                <div>Dispatched:</div>
                                                            )}
                                                        </td>
                                                        <td
                                                            className={inter.className}
                                                            style={{
                                                                textAlign: 'right',
                                                                fontSize: '13px',
                                                                color: '#333333',
                                                                fontWeight: 500,
                                                                lineHeight: '18px',
                                                            }}
                                                        >
                                                            {orderData.OrderNumber && (
                                                                <>
                                                                    <div className={inter.className}>{orderData.OrderNumber}</div><br />
                                                                </>
                                                            )}
                                                            {orderData.LFSOrderNumber && (
                                                                <>
                                                                    <div className={inter.className}>{orderData.LFSOrderNumber}</div><br />
                                                                </>
                                                            )}
                                                            {orderData.ProviderInvoiceNumber && (
                                                                <>
                                                                    <div className={inter.className}>{new Date(Date.parse(orderData.ProviderInvoiceNumber)).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</div><br />
                                                                </>
                                                            )}
                                                            <div className={inter.className}>{new Date(Date.parse(orderData.OrderPlacedDate)).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</div><br />
                                                            {!orderData.LFSOrderNumber && (
                                                                <div>{new Date(Date.parse(orderData.OrderDespatchedDate)).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                                                            )}
                                                        </td>
                                                        <td style={{ width: '20px' }}></td>
                                                    </tr>
                                                    <tr>
                                                        <td height="20" colSpan={4}></td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </td>
                                </tr>
                                {/* The rest of the code is missing */}
                            </tbody>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td height="40"></td>
                </tr>
                <tr>
                    <td>
                        <table className={inter.className} style={{ width: '100%', borderSpacing: 0, borderCollapse: 'collapse' }}>
                            <tbody>
                                <tr>
                                    <td className={inter.className}
                                        style={{
                                            verticalAlign: 'top',
                                            width: '60%',
                                            fontSize: '13px',
                                            color: '#333333',
                                            lineHeight: '18px',
                                        }}
                                    >
                                        <div
                                            style={{
                                                textTransform: 'uppercase',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {orderData.DeliverySummary[0].DeliveryDetails.Address.AddressTypeId === 4
                                                ? 'Pargo Pick-up Point:'
                                                : orderData.DeliverySummary[0].DeliveryDetails.Address.AddressTypeId === 5
                                                    ? 'Deliver 2 Me:'
                                                    : 'Delivery details:'}

                                        </div>
                                        <>
                                            {orderData.DeliverySummary[0].DeliveryDetails.Address.AddressTypeId === 5 ? (
                                                <div>You have selected Deliver 2 Me as your delivery option</div>
                                            ) : (
                                                <div>
                                                    {orderData.DeliverySummary[0].DeliveryDetails.Address.AddressLine1 && (
                                                        <div>{orderData.DeliverySummary[0].DeliveryDetails.Address.AddressLine1}</div>
                                                    )}
                                                    {orderData.DeliverySummary[0].DeliveryDetails.Address.AddressLine2 && (
                                                        <div>{orderData.DeliverySummary[0].DeliveryDetails.Address.AddressLine2}</div>
                                                    )}
                                                    {orderData.DeliverySummary[0].DeliveryDetails.Address.Suburb && (
                                                        <div>{orderData.DeliverySummary[0].DeliveryDetails.Address.Suburb}</div>
                                                    )}
                                                    {orderData.DeliverySummary[0].DeliveryDetails.Address.PostCode && (
                                                        <div>{orderData.DeliverySummary[0].DeliveryDetails.Address.PostCode}</div>
                                                    )}
                                                    {orderData.DeliverySummary[0].DeliveryDetails.Address.Country && (
                                                        <div>{orderData.DeliverySummary[0].DeliveryDetails.Address.Country}</div>
                                                    )}
                                                    {orderData.DeliverySummary[0].DeliveryDetails.ContactCellphone && (
                                                        <div>{orderData.DeliverySummary[0].DeliveryDetails.ContactCellphone}</div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    </td>
                                    <td className={inter.className}
                                        style={{
                                            verticalAlign: 'top',
                                            width: '40%',
                                            textAlign: 'right',

                                            fontSize: '13px',
                                            color: '#666666',
                                            lineHeight: '18px',
                                        }}
                                    >
                                        {new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}
                                        <br />
                                        <span style={{ fontWeight: 500, color: '#333333' }}>{orderData.InvoiceNumber}</span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </td>
                </tr>
                <OrderSection brandGrouping={brandGrouping} currencySymbol={orderData.CurrencySymbol} isBeGC={orderData.IsBeGC} paymentDetails={orderData.PaymentDetails} />
                <tr>
                    <td style={{ height: '20px' }}></td>
                </tr>
                <tr>
                    <td>
                        <table border={0} cellPadding="0" cellSpacing="0" width="100%">
                            <tbody>
                                <tr>
                                    <td width="476" valign="top">
                                        <table border={0} cellPadding="0" cellSpacing="0" width="100%">
                                            <tbody>
                                                <tr className={inter.className} style={{ fontSize: '13px', color: '#FFFFFF', textTransform: 'uppercase', fontWeight: 500 }}>
                                                    <td style={{ backgroundColor: "#000000", padding: '20px 15px', border: '1px solid #cccccc' }}>LEGAL
                                                        INFO </td>
                                                    <td width="20"></td>
                                                </tr>
                                                <tr>
                                                    <td className={inter.className} style={{ fontSize: '12px', padding: '20px 15px', color: '#666666', borderRight: '1px solid #cccccc', borderBottom: '1px solid #cccccc', borderLeft: '1px solid #cccccc' }}>
                                                        <div className={inter.className} style={{ fontWeight: 300 }}>
                                                            <p><strong>RETURNS &amp; REPAIRS</strong></p>
                                                            <p>You may return goods for FREE within 30 days to any SA store from
                                                                which the goods originate, with this invoice. This excludes the return of
                                                                furniture items, goods listed as <i>&ldquo;sold by Galaxy&rdquo;</i> and goods listed as
                                                                <i>&ldquo;sold by Bash&rdquo;</i>. Underwear, lingerie, swimwear, bodysuits, socks,
                                                                hosiery, cosmetics, toiletries, and edible goods can not be returned.
                                                                hi-online purchases (excluding TVs) can also be returned to any Foschini
                                                                store in SA. For our full returns and exchange policy, please see our
                                                                online shopping terms and conditions on the Bash website or app.
                                                                For more information or assistance in returning your goods, you may
                                                                contact our Bash Support Team on <span style={{ color: '#666666', fontWeight: 500, textDecoration: 'none' }}>0861 111 761</span> or email us on{' '}
                                                                <a style={{ color: '#666666', fontWeight: 500, textDecoration: 'none' }} href="mailto:support@bash.com">support@bash.com</a>.</p>
                                                            <p><strong>RICA</strong></p>
                                                            <p>Legislation requires that all SIM cards purchased in South Africa must be RICA&apos;d.</p>
                                                            <p><strong>GENERAL</strong></p>
                                                            <p>View our Frequently Asked Questions <a style={{ color: '#666666', fontWeight: 500, textDecoration: 'none' }} href="https://bash.com/customer-service/help">here</a>.</p>

                                                            <p><strong>SOLD BY GALAXY</strong></p>
                                                            <p>Goods listed as <i>&ldquo;sold by Galaxy&rdquo;</i> can only be returned by courier.</p>

                                                            <p><strong>SOLD BY BASH</strong></p>
                                                            <p>Sold by Bash
                                                                Goods listed as <i>&ldquo;sold by Bash&rdquo;</i> may not be returned to any TFGstore or
                                                                brand standalone store from which the items originated e.g. Aldo products
                                                                sold on Bash may not be returned to a Foschini or Aldo store. Goods
                                                                listed as &ldquo;sold by Bash&rdquo; can only be returned by courier.</p>


                                                            <p><strong>FURNITURE</strong></p>
                                                            <p>Read clauses 5 and 6 of our online shopping terms and conditions for
                                                                more information on furniture orders <a style={{ color: '#666666', fontWeight: 500, textDecoration: 'none' }} href="https://bash.com/customer-service/terms/online-shopping">here</a>.</p>
                                                            {orderData.PaymentDetails.CharityAmount > 0 && (
                                                                <>
                                                                    <p><strong>CHARITY DONATIONS</strong></p>
                                                                    <p>Please note: your R10 donation will be transferred into TFG Foundation immediately, and is non-refundable, even if your order is cancelled or returned.</p>
                                                                </>)}
                                                        </div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </td>
                                    <td className={inter.className} width="230" valign="top" style={{ border: '1px solid #cccccc' }}>
                                        <table className={inter.className} border={0} cellPadding="0" cellSpacing="0" width="100%">
                                            <tbody>
                                                <tr>
                                                    <td height="20" colSpan={3}></td>
                                                </tr>
                                                <tr>
                                                    <td width="10"></td>
                                                    <td>
                                                        {SubtotalSection(orderData)}
                                                    </td>
                                                    <td width="10"></td>
                                                </tr>
                                                <tr>
                                                    <td height="20" colSpan={3}></td>
                                                </tr>
                                                <tr style={{ backgroundColor: "#e5e5e5" }}>
                                                    <td colSpan={3} height="20" style={{ borderTop: '1px solid #cccccc' }}></td>
                                                </tr>
                                                <tr style={{ backgroundColor: "#e5e5e5" }}>
                                                    <td width="10"></td>
                                                    <td>
                                                        <table border={0} cellPadding="0" cellSpacing="0" width="100%">
                                                            <tbody>
                                                                <tr>
                                                                    <td width="60%" className={inter.className} style={{ fontWeight: 500, fontSize: '13px', color: '#666666' }}>
                                                                        <div>Total excl tax</div>
                                                                        <div>Tax at 15%</div>
                                                                        <div>Total incl tax</div>
                                                                    </td>
                                                                    <td width="40%" align="right" className={inter.className} style={{ fontWeight: 400, fontSize: '13px', color: '#999999' }}>
                                                                        <div style={{ color: '#000000' }}>{ZAR(orderData.PaymentDetails.TotalBeforeTaxAmount)}</div>
                                                                        <div style={{ color: '#000000' }}>{ZAR(orderData.PaymentDetails.TaxAmount)}</div>
                                                                        <div style={{ color: '#000000' }}>{ZAR(orderData.PaymentDetails.TotalAfterTaxAmount)}</div>
                                                                    </td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </td>
                                                    <td width="10"></td>
                                                </tr>
                                                {PaymentSection(orderData)}
                                            </tbody>
                                        </table>

                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style={{ height: '40px' }}></td>
                </tr>
            </tbody>
        </table>
    )

}